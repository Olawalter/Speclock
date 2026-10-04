"""Direct-mode harness: the real contract against a stub `genlayer` module.

The stub is strict in the places that decide whether a test means anything.

VALIDATORS ACTUALLY RUN. `gl.vm.run_nondet` runs the leader closure and then the
validator closure on the leader's result. A validator that returns False fails
the round and nothing is written, exactly as on the network. A harness that
skipped the validator would let a leader-only check pass for consensus, which is
the single easiest way to ship a contract whose agreement is decorative.

THE MODEL ANSWERS PER ROLE. `exec_prompt` is served from queues keyed by the
requirement it is being asked about AND by who is asking -- leader or validator.
That is what lets a test make two nodes read the same two documents differently,
which is the case the whole design exists for.

THE CLOCK IS SET, NEVER READ FROM THE WALL. `h.at(iso)` fixes the transaction's
datetime, so both sides of a window are reachable and nothing depends on when
the suite happens to run.

A REFUSAL LEAVES NOTHING BEHIND. A public write that raises restores every
storage field, because a half-written refusal on chain is a defect this harness
should be able to catch.
"""
import copy
import importlib.util
import json
import os
import pathlib
import sys
import types
from datetime import datetime, timezone

import pytest

# SPECLOCK_CONTRACT lets the mutation sweep point this suite at a deliberately
# broken copy. Without it every mutant would "survive" by never being loaded,
# and the sweep would report a suite that holds everything while testing nothing.
CONTRACT_PATH = pathlib.Path(os.environ.get("SPECLOCK_CONTRACT")
                             or pathlib.Path(__file__).resolve().parents[2] / "contracts"
                             / "speclock.py")

PUBLISHER = "0xA1b2C3d4E5f60718293A4b5C6d7E8f9012345678"
INTEGRATOR = "0xB2c3D4e5F60718293a4B5c6D7e8F90123456789A"
STRANGER = "0xC3d4E5f60718293a4b5C6d7E8f90123456789aB2"
DEPLOYER = "0xD4e5F60718293a4b5c6D7e8F90123456789aB2c3"

NOW = "2026-10-04T09:00:00+00:00"


# ── the stub ──────────────────────────────────────────────────────────────────

class UserError(Exception):
    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


class Return:
    """What run_nondet hands a validator: the leader's returned value."""

    def __init__(self, calldata):
        self.calldata = calldata


class Rollback(Exception):
    pass


class TreeMap(dict):
    """Enough of the storage map for this contract: get, set, membership."""

    def get(self, key, default=None):
        return dict.get(self, key, default)


class _Harness:
    """Drives the contract the way a node would."""

    def __init__(self):
        self.sender = PUBLISHER
        self.when = datetime.fromisoformat(NOW)
        self.contract = None
        # requirement id -> role -> list of answers, popped in order
        self.answers = {}
        self.prompts = []
        self.role = "leader"
        self.dissents = []

    # -- the world a test sets up -----------------------------------------
    def at(self, iso: str) -> None:
        self.when = datetime.fromisoformat(iso)

    def says(self, requirement_id: str, status: str, evidence: str = "", reasoning: str = "",
             role: str = "both", times: int = 24) -> None:
        """What a reader concludes about one requirement.

        `role` is the point of this harness: "leader", "validator", or "both".
        A test that wants the panel to disagree says so here.
        """
        answer = json.dumps({"status": status, "evidence": evidence,
                             "reasoning": reasoning or "from the documents"})
        for which in (("leader", "validator") if role == "both" else (role,)):
            self.answers.setdefault(requirement_id, {}).setdefault(which, []).extend(
                [answer] * times)

    def raw(self, requirement_id: str, payload: str, role: str = "both", times: int = 24) -> None:
        """Hand back something that is not a well-formed answer at all."""
        for which in (("leader", "validator") if role == "both" else (role,)):
            self.answers.setdefault(requirement_id, {}).setdefault(which, []).extend(
                [payload] * times)

    def clear_answers(self) -> None:
        self.answers = {}

    # -- what the contract sees -------------------------------------------
    def _answer_for(self, prompt: str) -> str:
        self.prompts.append(prompt)
        rid = ""
        for line in prompt.split("\n"):
            if line.startswith("Id: "):
                rid = line[4:].strip()
                break
        queue = self.answers.get(rid, {}).get(self.role)
        if not queue:
            raise AssertionError(
                f"the {self.role} was asked about {rid or 'an unknown requirement'} and this test "
                f"never said what it would conclude")
        return queue.pop(0)

    def call(self, method: str, *args, sender=None):
        """Send a transaction. A raise restores storage, as a revert would."""
        if sender is not None:
            self.sender = sender
        before = {name: copy.deepcopy(getattr(self.contract, name))
                  for name in self.contract.__dict__}
        try:
            return getattr(self.contract, method)(*args)
        except Exception:
            for name, value in before.items():
                setattr(self.contract, name, value)
            raise


HARNESS = _Harness()


def _build_stub() -> types.ModuleType:
    gl = types.ModuleType("genlayer")

    # -- contract base -------------------------------------------------------
    contract_mod = types.ModuleType("genlayer.contract")

    class Contract:
        pass

    contract_mod.Contract = Contract
    gl.contract = contract_mod

    # -- storage -------------------------------------------------------------
    storage_mod = types.ModuleType("genlayer.storage")
    storage_mod.TreeMap = TreeMap
    gl.storage = storage_mod

    # -- message -------------------------------------------------------------
    message_mod = types.ModuleType("genlayer.message")

    class _Message:
        @property
        def sender_address(self):
            return HARNESS.sender

    gl.message = _Message()

    # -- vm ------------------------------------------------------------------
    vm_mod = types.ModuleType("genlayer.vm")
    vm_mod.UserError = UserError
    vm_mod.Return = Return

    def run_nondet(leader_fn, validator_fn):
        """Leader, then validator on the leader's result. Disagreement raises.

        On the network a round with no majority writes nothing and the caller
        sees a failed transaction; here that is an exception, which is what
        makes `expect_no_majority` a real assertion rather than a hope.
        """
        HARNESS.role = "leader"
        try:
            value = leader_fn()
        except Exception as exc:                       # the leader itself failed
            HARNESS.role = "validator"
            agreed = validator_fn(exc)
            if not agreed:
                raise UserError("[NO_MAJORITY] the validators did not agree with the leader")
            raise
        HARNESS.role = "validator"
        agreed = validator_fn(Return(value))
        HARNESS.role = "leader"
        if not agreed:
            raise UserError("[NO_MAJORITY] the validators did not agree with the leader")
        return value

    vm_mod.run_nondet = run_nondet
    gl.vm = vm_mod

    # -- nondet --------------------------------------------------------------
    nondet_mod = types.ModuleType("genlayer.nondet")

    def exec_prompt(prompt: str, response_format: str = "text", **kwargs):
        assert response_format == "json", "this contract always asks for JSON"
        return HARNESS._answer_for(prompt)

    nondet_mod.exec_prompt = exec_prompt
    gl.nondet = nondet_mod

    # -- public decorators ---------------------------------------------------
    public_mod = types.ModuleType("genlayer.public")

    def view(fn):
        fn._speclock_view = True
        return fn

    class _Write:
        def __call__(self, fn):
            fn._speclock_write = True
            return fn

        def payable(self, fn):                         # unused here; SPECLOCK holds no funds
            fn._speclock_write = True
            return fn

    public_mod.view = view
    public_mod.write = _Write()
    gl.public = public_mod

    # -- types ---------------------------------------------------------------
    types_mod = types.ModuleType("genlayer.types")

    class Address(str):
        pass

    types_mod.Address = Address
    types_mod.u256 = int
    gl.types = types_mod
    return gl


def _install_stub() -> None:
    gl = _build_stub()
    sys.modules["genlayer"] = gl
    for name in ("contract", "storage", "vm", "nondet", "public", "types"):
        sys.modules[f"genlayer.{name}"] = getattr(gl, name)


def _load_contract():
    """Import the real contract file against the stub, fresh each time."""
    _install_stub()
    spec = importlib.util.spec_from_file_location("_speclock_contract", CONTRACT_PATH)
    module = importlib.util.module_from_spec(spec)
    sys.modules["_speclock_contract"] = module
    spec.loader.exec_module(module)
    return module


# the contract reads the transaction clock through datetime.now, so the stub
# module's datetime is patched to answer with whatever the test set
def _patch_clock(module) -> None:
    class _DateTime(datetime):
        @classmethod
        def now(cls, tz=None):
            when = HARNESS.when
            return when if tz is None else when.astimezone(tz)

    module.datetime = _DateTime


@pytest.fixture
def h():
    """A fresh contract, deployed, with the clock at a known moment."""
    HARNESS.__init__()
    module = _load_contract()
    _patch_clock(module)
    instance = module.Speclock.__new__(module.Speclock)
    for name, kind in module.Speclock.__annotations__.items():
        setattr(instance, name, TreeMap() if "TreeMap" in str(kind) else "")
    HARNESS.sender = DEPLOYER
    instance.__init__()
    HARNESS.contract = instance
    HARNESS.module = module
    HARNESS.sender = PUBLISHER
    yield HARNESS


@pytest.fixture
def contract(h):
    return h.contract


def expect_error(kind: str, fragment: str = ""):
    """Assert a refusal of a particular class, by its prefix not its prose."""
    class _Checker:
        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            assert exc_type is not None, f"expected a {kind} refusal and nothing was raised"
            assert isinstance(exc, UserError), f"expected UserError, got {exc_type.__name__}: {exc}"
            assert exc.message.startswith(kind), (
                f"expected a {kind} refusal, got: {exc.message}")
            if fragment:
                assert fragment.lower() in exc.message.lower(), (
                    f"expected {fragment!r} in the reason, got: {exc.message}")
            return True
    return _Checker()

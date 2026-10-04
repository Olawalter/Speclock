import { configResult } from "@/lib/config/env";

/**
 * When the console is pointed at nothing, say which variable and what it wanted.
 * Rendering "undefined" into a product about verifiable claims is not an option.
 */
export function ConfigProblem() {
  if (configResult.ok) return null;
  return (
    <section role="alert" className="panel p-5">
      <h1 className="text-lg">This console is not pointed at a contract</h1>
      <p className="lede mt-1">
        Set these in <span className="mono">web/.env.local</span> and restart. Until then nothing
        here can read the chain, and it will not pretend otherwise.
      </p>
      <table className="mt-4 w-full text-sm">
        <thead>
          <tr className="label text-left">
            <th className="py-2 pr-4 font-normal">Variable</th>
            <th className="py-2 pr-4 font-normal">Expected</th>
            <th className="py-2 font-normal">Found</th>
          </tr>
        </thead>
        <tbody>
          {configResult.problems.map((problem) => (
            <tr key={problem.variable} className="border-t">
              <td className="mono py-2 pr-4">{problem.variable}</td>
              <td className="py-2 pr-4 text-[var(--slate)]">{problem.expected}</td>
              <td className="mono py-2 text-[var(--breaking-ink)]">{problem.found}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

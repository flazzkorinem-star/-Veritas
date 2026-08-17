import type { NodeSession } from "./contracts";

export function getNodeScore(session: NodeSession) {
  return (
    Object.values(session.stages).filter(
      ({ status }) => status === "PASSED" || status === "PASSED_WITH_HINT",
    ).length * 25
  );
}

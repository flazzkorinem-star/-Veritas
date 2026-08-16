import { knowledgeMapSchema, type KnowledgeMap } from "./contracts";

export function combineKnowledgeMaps(maps: KnowledgeMap[]): KnowledgeMap {
  let nextNode = 1;
  const nodes: KnowledgeMap["nodes"] = [];
  const coverageAssignments: KnowledgeMap["coverageAssignments"] = [];

  for (const map of maps) {
    const nodeIds = new Map<string, string>();
    for (const node of map.nodes.toSorted((left, right) => left.order - right.order)) {
      const id = `node-${nextNode}`;
      nodeIds.set(node.id, id);
      nodes.push({ ...node, id, order: nextNode });
      nextNode += 1;
    }
    coverageAssignments.push(
      ...map.coverageAssignments.map((assignment) =>
        assignment.disposition === "REFERENCE_ONLY"
          ? assignment
          : { ...assignment, nodeId: nodeIds.get(assignment.nodeId)! },
      ),
    );
  }

  return knowledgeMapSchema.parse({
    modules: maps.flatMap(({ modules }) => modules),
    knowledgeItems: maps.flatMap(({ knowledgeItems }) => knowledgeItems),
    nodes,
    coverageAssignments,
  });
}

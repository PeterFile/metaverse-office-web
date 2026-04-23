import type { WorkflowInteraction } from '../types';

export function collectInteractionSourceKinds({
  workflowInteractions = [],
  correlationInteractions = []
}: {
  workflowInteractions?: readonly WorkflowInteraction[];
  correlationInteractions?: readonly WorkflowInteraction[];
}) {
  return [...workflowInteractions, ...correlationInteractions].flatMap((interaction) =>
    typeof interaction.source_kind === 'string' && interaction.source_kind.trim().length > 0
      ? [interaction.source_kind]
      : []
  );
}

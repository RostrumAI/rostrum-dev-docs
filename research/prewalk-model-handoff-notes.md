# Prewalk-style model handoff notes

Status: Research input for model-node execution design  
Source: [Stencil: You only need the frontier model for one single edit](https://stencil.so/blog/prewalk)

## Summary

Stencil's `/prewalk` describes a model-execution pattern rather than a workflow-intake feature. A stronger or more capable model begins the task, explores the relevant code and context, establishes a plan and task checklist, and makes the first valid edit. Once a declared transition point is reached, execution transfers to a cheaper or faster model while preserving the trajectory in the active context.

The handoff is not just a prose plan. A prose plan forces the second model to reread the repository and reconstruct the first model's understanding. The useful state is the grounded execution trajectory: context already read, hypotheses tested, tool calls, structured task state, first valid action, and remaining checklist.

The article reports benchmark results from the authors' harness, including lower cost and faster completion for the prewalk arrangement in the tested tasks. Rostrum should treat those results as an implementation hypothesis, not a product guarantee.

## Rostrum interpretation: the transfer node

Prewalk should be modeled as one use of a first-class `transfer` node. The node transfers an active model conversation/execution trajectory to a different model or agent runtime. It is not a hidden provider optimization and it is not limited to software development.

A transfer node should:

1. receive an active conversation/trajectory and a declared target model or runtime;
2. evaluate a transfer condition, such as first valid action, completed exploration budget, checklist checkpoint, first passing test, or an explicit workflow edge;
3. apply configured context-pruning rules;
4. preserve the selected trajectory state, tool history, structured task state, artifacts, and policy context;
5. initialize the receiving model with the resulting conversation and continuation contract;
6. continue ordinary policy enforcement, budgets, verification, and human gates after the transfer.

The workflow graph should be able to place a transfer node anywhere a model conversation is active. A transfer can be followed by more transfer nodes, a deterministic node, a verifier, an approval gate, or a terminal state.

### Transfer-node configuration

The node should expose explicit options for:

- **Target:** model/provider/runtime, fallback targets, capability requirements, and data-region constraints.
- **Condition:** first edit/action, checklist state, token/time budget, test milestone, event, approval, or expression over trajectory state.
- **Context retention:** retain all, retain selected turns, retain tool calls, retain referenced artifacts, retain summaries, or retain only schema-validated state.
- **Context pruning:** remove system/developer instructions, planning instructions, stale observations, selected tool outputs, sensitive fields, or context from named sources/nodes.
- **Conversation shape:** continue the same conversation, create a new conversation seeded from a transfer packet, or fork multiple receiving conversations.
- **Task state:** preserve, summarize, validate, or reconstruct the checklist and completion criteria.
- **First action:** require the receiving model to acknowledge state, continue immediately, run a validation step, or produce a structured readiness result.
- **Failure behavior:** retry the transfer, fall back to another model, resume with the source model, pause for approval, or fail the node.
- **Oversized context:** prune by policy, summarize through a configured model, spill to artifacts and references, or stop safely.

The transfer node must report what was retained, pruned, summarized, or rejected. The resulting transfer packet is an auditable artifact or event, not an opaque provider-side mutation.

The handoff condition must be explicit and observable. A fixed turn count is likely too coarse because the model may be lost or finished at different points. A first edit alone is also insufficient. The workflow should require a bounded checklist and a validation condition so the executor does not lose the task's completion criteria.

## Required boundaries

- Transfer is initiated by workflow configuration or runtime policy, not by an opaque provider-specific behavior.
- Each model/provider invocation remains attributable to a node execution and cost/usage record.
- Handoff cannot expand tool, context, credential, network, or filesystem authority.
- The receiving model must see which context was already read, which claims remain hypotheses, which actions occurred, and which validation steps remain.
- A transfer may preserve a live context window where the provider supports it, or reconstruct an equivalent trajectory from structured events and bounded summaries where it does not.
- Prompt prefill or hidden instructions must be treated as a provider-specific mechanism with security and portability risks; the public Rostrum contract should describe the resulting trajectory and transition, not require unsafe token-level manipulation.

## Evaluation questions

- Does trajectory handoff reduce cost or latency once context transfer, provider setup, and verification are included?
- Which handoff conditions generalize beyond code editing?
- How much context must be preserved for the receiving model to avoid redundant reads?
- Does a first valid action improve reliability, or does it create premature-commitment failure modes?
- How should the runtime recover if the receiving model rejects or cannot reconstruct the handoff?
- How should evaluation compare one-model execution, prose-plan handoff, and trajectory handoff?

## Initial decision

Rostrum should implement a first-class transfer node with prewalk-style configuration as one supported strategy. A two-model transfer should remain optional, and the original article's benchmark numbers should not become acceptance criteria. The first implementation should preserve a provider-neutral transfer packet, test model swaps with a local/mock provider, and make pruning and failure behavior visible before optimizing for specific model APIs.

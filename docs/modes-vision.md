# Modes Vision

## Purpose

This document is a working note on how **interaction modes** might operate in `Confer with the Stoics`.

It is intentionally exploratory. It is not a locked specification. The purpose is to gather the main ideas, tensions, and possible directions in one place so future design and implementation decisions have a shared reference point.

## Current Working Assumptions

At the moment, the most stable assumptions are:

- a conversation selects its mode when the thread is created
- a conversation does **not** switch modes mid-thread
- a conversation does **not** switch LLM model mid-thread
- RAG is shared across all modes
- existing threads should keep a stable mode snapshot even if an admin later edits or deletes the source mode

These assumptions feel useful right now because they preserve coherence and make testing easier, but they should still be treated as assumptions rather than eternal truths.

## What A Mode Might Be

There are at least two valid ways to think about modes:

### 1. A mode as a conversational configuration

In this framing, a mode is mainly:

- a name
- a description
- a prompt stack
- optional skills
- maybe some output formatting or tool constraints

This is the smallest and most implementation-friendly interpretation.

### 2. A mode as a distinct bot or experience

In this framing, a mode is not just a prompt bundle. It can also include:

- distinct rhetoric and tone
- different response structures
- different tool availability
- different UI controls
- different rendering patterns
- different expectations for what the user is doing in the conversation

Under this interpretation, each mode is effectively a different bot built on a shared platform.

Both framings are valid. The product may ultimately live somewhere between them.

## A Shared Platform With Multiple Bots

One useful way of thinking about the app is:

- one shared platform
- one shared Stoic corpus
- one shared thread model
- one shared retrieval layer
- multiple mode-specific bots or experiences

This feels closer to the real product than saying modes are "just prompt presets."

The user is likely to experience `Scholar`, `Mentor`, `Socratic`, or `Meditative` as different agents, even if they share a lot of infrastructure.

## Dimensions Along Which Modes Can Differ

Modes could differ along many axes, not only prompting.

### Conversational stance

- direct advice vs inquiry
- practical counsel vs philosophical interpretation
- gentle tone vs demanding rigor
- short answers vs developed reflections

### Reasoning style

- question-led
- argumentative
- exegetical
- contemplative
- exercise-oriented

### Output shape

- questions first
- thesis plus evidence
- practical takeaway plus exercise
- commentary plus citations

### Retrieval usage

- closely quote retrieved passages
- paraphrase them into practical guidance
- compare retrieved passages across authors
- use retrieved material as prompts for inquiry rather than as conclusions

### Tooling and capabilities

- available skills
- available tools
- structured output requirements
- special helper flows

### UI and interaction design

- different composer hints
- different suggested actions
- different message layouts
- different citation emphasis
- different controls or affordances

This is the main reason the document should stay open-ended: mode differentiation may happen at multiple layers of the product.

## Prompting As One Major Lever

Prompting is still likely to be one of the strongest ways to define a mode.

Prompts are well suited to expressing:

- stance
- tone
- rhetorical posture
- response structure
- how to treat retrieved material
- how direct or exploratory replies should be

If a behavior should influence most replies in a mode, prompting is a natural place to express it.

That said, it is too limiting to say modes are *primarily* prompts in all cases. Some modes may eventually need more than that.

## Skills As Another Lever

Skills remain a useful concept, but their exact place in the modes story is still open.

One plausible model is:

- prompts define standing behavior
- skills provide optional procedures or specialized moves

Examples:

- close textual comparison
- structured dialectic
- practical exercise generation
- comparative treatment of multiple Stoic authors

Another possibility is that skills become less important for modes than initially expected, and mostly serve as infrastructure for future specialized behaviors rather than for mode identity itself.

This remains an open design question.

## AI SDK Levers Beyond Prompting

If modes are meant to feel materially different, prompting is not the only available mechanism. AI SDK gives several orchestration levers that can contribute to mode identity:

- system instructions
- message shaping and history selection
- tools and tool descriptions
- active tool sets
- forced or suggested tool choice
- structured output requirements
- middleware and cross-cutting prompt/runtime policy
- provider/model settings at the thread level
- response rendering choices in the UI

The practical lesson is that a mode may become a composition of:

- prompt design
- runtime orchestration
- tool boundaries
- UI behavior

## RAG Across Modes

At present, the clearest working assumption is that RAG is shared across all modes.

That likely means:

- the same retrieval service is called regardless of mode
- the same corpus is available regardless of mode
- source citation remains a common product feature

But "shared RAG" does **not** mean all modes use retrieval in the same way.

Possible differences:

- `Scholar` may stay closer to the retrieved wording
- `Mentor` may translate retrieved texts into action more aggressively
- `Socratic` may turn retrieved passages into questions
- another mode might foreground disagreement or interpretive uncertainty

So the retrieval substrate may be common even while the rhetorical handling of retrieval differs substantially by mode.

## Thread Identity

The current model implies that a thread is not just a storage container. It is a conversation conducted **under a chosen frame**.

That has several implications:

- the thread should remember which mode it belongs to
- the mode should remain legible in the UI
- old threads should preserve their original framing
- testers should be able to compare threads across modes without ambiguity

This still feels like a strong design direction.

## Snapshotting

Snapshotting remains one of the clearest product wins in the current architecture.

When a thread stores a snapshot of the selected mode, it gives the product:

- historical reproducibility
- safer admin editing
- easier debugging
- more trustworthy mode comparisons

Even if the broader theory of modes evolves, snapshotting still seems like the right default.

## UI/UX Possibilities

One important correction to earlier thinking:

modes do not have to share the same UI/UX.

Even if the app begins with one shared chat interface, a richer version of the product could let modes affect:

- the thread header treatment
- composer copy
- starter prompts
- message formatting
- citation presentation
- follow-up controls
- side panels or supporting views

This may become one of the strongest ways to make modes feel genuinely different.

In other words, mode differentiation does not have to stop at prompt assembly.

## Admin Mental Model

The current admin model suggests:

- prompts are reusable building blocks
- skills are reusable building blocks
- modes are compositions of those pieces

That still seems useful, but it may not be the full future picture.

If modes evolve into richer bot/experience packages, the admin system may eventually need to manage more than prompts and skills, for example:

- UI metadata
- response schema choices
- suggested actions
- mode-specific rendering options
- allowed tools or behaviors

For now, the existing CRUD model is sufficient as a foundation.

## User Mental Model

From the user's perspective, a mode should probably answer at least three questions:

- what is this mode for?
- how will this mode engage me?
- why would I choose this mode instead of another one?

The user does not need to know whether the implementation is driven by prompts, skills, tools, or UI rules. They only need to feel that the mode choice meaningfully changes the conversation.

That is arguably the real test of whether modes are working.

## A Useful Spectrum

It may help to think of modes on a spectrum:

### Minimal mode

- mostly prompt differences
- same UI
- same retrieval behavior
- same tool surface

### Moderate mode

- different prompt stack
- different output structure
- different tool/skill availability
- subtle UI cues

### Strong mode

- different prompt stack
- different runtime behavior
- different tooling
- distinct UX affordances
- clearly perceived as a different bot

The product does not need to decide today where it will end up permanently, but it should know that this spectrum exists.

## Open Questions

These questions remain intentionally unresolved:

- Are modes best framed internally as prompt configurations, bots, or experience packages?
- How much UI differentiation should modes eventually have?
- Should all modes share one generic chat surface forever, or can mode-specific surfaces emerge?
- How much of mode identity should live in prompts versus runtime orchestration?
- What behaviors are important enough to deserve skills?
- Should some modes have access to tools or affordances that others do not?
- Is "shared retrieval layer, different retrieval usage" enough, or will some modes eventually want retrieval configuration differences too?
- How should the app evaluate whether two modes are meaningfully different?
- What information should always be visible to the user about the currently selected mode?
- At what point does a mode become complex enough that it should be treated as a first-class bot configuration rather than a composition of prompts and skills?

## Provisional Direction

If a provisional direction is needed right now, it is probably this:

- keep the current thread-scoped, snapshot-based model
- keep mode/model fixed for the duration of the thread
- continue treating RAG as shared infrastructure
- allow the conceptual definition of a mode to remain broader than "prompt stack"
- avoid prematurely collapsing the design into one mechanism

This leaves room for the product to evolve toward:

- prompt-first modes
- tool-aware modes
- UI-distinct modes
- or full mode-specific bots on a shared Stoic platform

## Summary

Modes are best treated, for now, as the main product concept for differentiating ways of engaging the Stoic assistant.

What exactly a mode is remains open.

It may be:

- a prompt configuration
- a bot identity
- a runtime configuration
- a UI/UX package
- or some combination of all of these

The important thing is not to force closure too early. This is still a think-tank topic, and the app should preserve enough flexibility for modes to become richer as the product vision sharpens.

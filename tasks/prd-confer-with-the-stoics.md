# PRD: Confer with the Stoics

## 1. Introduction / Overview

Build an internal beta AI chat application called **Confer with the Stoics**.

The product provides a multi-thread chat experience where each conversation runs in an admin-defined **interaction mode**. A mode defines how the assistant behaves by combining a set of prompts and skills (core product tenet). Different modes can be tested in parallel (for example, a structured stoic guidance mode vs a more open conversational mode).

RAG is shared across all interaction modes and uses an API pattern based on `reference/rag-server/`. RAG content ingestion and management are out of scope in this phase; focus is on full query/retrieval flow and source-aware chat behavior.

Authentication can be stubbed in this phase. Clerk integration is explicitly out of scope.

## 2. Goals

- Deliver an internal beta (`1B`) with stable core chat and admin workflows.
- Support multi-thread chat history (`2B`) with create/rename/delete thread operations.
- Make prompts and skills admin-managed first-class entities, and bind them to interaction modes.
- Enable rapid experimentation with multiple interaction modes without code changes.
- Ensure RAG is common to all chat modes and integrated through a `rag-server`-style API contract (`5B`).
- Use AI SDK for model generation and streaming flows across the app (except RAG-specific retrieval service integration).

## 3. User Stories

### US-001: Initialize app foundation with required stack
**Description:** As a developer, I want a consistent baseline so that all feature work follows the same architecture and tooling.

**Acceptance Criteria:**
- [ ] Project uses Next.js App Router with TypeScript.
- [ ] Tailwind CSS follows v4 patterns only (per `tailwindv4.md`).
- [ ] AI SDK is installed and used as the default LLM integration path.
- [ ] `pnpm lint` and `pnpm typecheck` scripts run successfully.

### US-002: Define persistence models for prompts, skills, modes, chats, and messages
**Description:** As a developer, I want explicit data models so that mode behavior and conversation history are durable and queryable.

**Acceptance Criteria:**
- [ ] Data models exist for `Prompt`, `Skill`, `InteractionMode`, `ConversationThread`, and `Message`.
- [ ] `InteractionMode` supports many-to-many associations with prompts and skills.
- [ ] `ConversationThread` stores a mode snapshot at creation time to preserve historical behavior.
- [ ] Create/read/update/delete operations are available for all admin-managed entities.
- [ ] `pnpm lint` and `pnpm typecheck` pass.

### US-003: Add stubbed admin access control
**Description:** As a team member, I want non-public admin routes so that configuration editing is constrained before Clerk is added.

**Acceptance Criteria:**
- [ ] `/admin` routes require a stub auth guard (for example, env flag, static token, or middleware check).
- [ ] Unauthorized access returns a clear blocked state.
- [ ] Stub auth implementation is isolated so Clerk can replace it later without major refactor.
- [ ] `pnpm lint` and `pnpm typecheck` pass.
- [ ] Verify in browser using dev-browser skill.

### US-004: Build prompt management UI (basic CRUD)
**Description:** As an admin, I want to manage prompt templates so that interaction behavior can be adjusted without code changes.

**Acceptance Criteria:**
- [ ] Admin can create, list, edit, and delete prompts.
- [ ] Prompt fields include at minimum: name, prompt role/type, and content.
- [ ] Required-field validation prevents empty prompt name/content.
- [ ] Prompt edits persist and are visible immediately in admin lists.
- [ ] `pnpm lint` and `pnpm typecheck` pass.
- [ ] Verify in browser using dev-browser skill.

### US-005: Build skills management UI (basic CRUD)
**Description:** As an admin, I want to manage skill definitions so that model behavior constraints are configurable and testable.

**Acceptance Criteria:**
- [ ] Admin can create, list, edit, and delete skills.
- [ ] Skill fields include at minimum: name, description, and instruction body.
- [ ] Skill records are available for assignment when creating/editing interaction modes.
- [ ] Validation prevents duplicate skill names.
- [ ] `pnpm lint` and `pnpm typecheck` pass.
- [ ] Verify in browser using dev-browser skill.

### US-006: Build interaction mode management UI (basic CRUD + associations)
**Description:** As an admin, I want to define interaction modes so that different chat behaviors can be tested safely.

**Acceptance Criteria:**
- [ ] Admin can create, list, edit, and delete interaction modes.
- [ ] Mode fields include at minimum: name, slug, description, active/inactive status.
- [ ] Admin can attach multiple prompts and skills to each mode.
- [ ] One mode can be set as default for new chats.
- [ ] Mode configuration clearly indicates shared RAG behavior is always enabled.
- [ ] `pnpm lint` and `pnpm typecheck` pass.
- [ ] Verify in browser using dev-browser skill.

### US-007: Deliver multi-thread chat workspace
**Description:** As an end user, I want multiple chat threads so I can keep separate conversations for separate topics.

**Acceptance Criteria:**
- [ ] User can create a new thread.
- [ ] User can rename and delete existing threads.
- [ ] Thread list shows latest activity ordering.
- [ ] Selecting a thread loads full message history.
- [ ] `pnpm lint` and `pnpm typecheck` pass.
- [ ] Verify in browser using dev-browser skill.

### US-008: Select interaction mode per conversation
**Description:** As an end user, I want to choose a mode when starting a conversation so the assistant behavior matches my intent.

**Acceptance Criteria:**
- [ ] New thread flow requires selecting an active interaction mode.
- [ ] Selected mode is displayed in thread header.
- [ ] Mode is locked to the thread snapshot unless explicitly changed by defined UX behavior.
- [ ] If a mode is deactivated by admin, existing threads continue using their stored snapshot.
- [ ] `pnpm lint` and `pnpm typecheck` pass.
- [ ] Verify in browser using dev-browser skill.

### US-009: Implement mode-aware prompt assembly pipeline
**Description:** As a developer, I want deterministic prompt assembly so that mode behavior is reproducible and debuggable.

**Acceptance Criteria:**
- [ ] Server-side assembly composes final system context from the mode’s attached prompts and skills.
- [ ] Assembly order is explicit and deterministic.
- [ ] Assembled context for each response can be inspected in logs or debug metadata.
- [ ] Prompt assembly has automated unit tests for ordering and missing-config edge cases.
- [ ] `pnpm lint` and `pnpm typecheck` pass.

### US-010: Implement AI SDK chat runtime with streaming responses
**Description:** As an end user, I want responsive streamed answers so that the app feels fast and conversational.

**Acceptance Criteria:**
- [ ] Chat generation uses AI SDK APIs for model invocation and streaming.
- [ ] Thread history is passed to generation in correct order (user/assistant roles preserved).
- [ ] UI supports in-flight state, cancel/retry behavior, and error states.
- [ ] No direct provider SDK calls are used in normal chat runtime paths.
- [ ] `pnpm lint` and `pnpm typecheck` pass.
- [ ] Verify in browser using dev-browser skill.

### US-011: Integrate shared RAG service using `rag-server`-style API contract
**Description:** As a developer, I want a stable RAG adapter so that all interaction modes can use the same retrieval layer.

**Acceptance Criteria:**
- [ ] A RAG client module calls a backend API shaped after `reference/rag-server` request/response schemas.
- [ ] RAG request includes message/query, conversation context, and mode-relevant configuration.
- [ ] Retrieved sources are returned in a normalized format for rendering in chat.
- [ ] Streaming and non-stream RAG response handling is supported where applicable.
- [ ] Graceful handling exists for empty corpus / missing vector store / unavailable RAG service.
- [ ] `pnpm lint` and `pnpm typecheck` pass.

### US-012: Render source citations and retrieval context in chat UI
**Description:** As an end user, I want to see citations so I can trust where responses came from.

**Acceptance Criteria:**
- [ ] Assistant messages can display source citations with source, excerpt, and optional page.
- [ ] Citations are attached to the correct message in each thread.
- [ ] Empty-retrieval state is visible and non-breaking for conversation flow.
- [ ] `pnpm lint` and `pnpm typecheck` pass.
- [ ] Verify in browser using dev-browser skill.

### US-013: Add internal-beta quality checks and documentation
**Description:** As a developer, I want clear verification steps so the team can iterate on interaction modes safely.

**Acceptance Criteria:**
- [ ] Basic test coverage exists for prompt assembly, mode resolution, and RAG adapter parsing.
- [ ] Smoke tests cover thread CRUD and one end-to-end message send flow.
- [ ] README includes local setup, env vars, admin stub auth notes, and RAG service expectations.
- [ ] `pnpm lint`, `pnpm typecheck`, and tests pass in local environment.

## 4. Functional Requirements

- FR-1: The system must provide a Next.js + TypeScript web app foundation.
- FR-2: The frontend styling system must use Tailwind CSS v4 patterns only.
- FR-3: The app must expose an admin area at `/admin` with stubbed access control.
- FR-4: The system must support prompt CRUD (create, read, update, delete).
- FR-5: The system must support skill CRUD (create, read, update, delete).
- FR-6: The system must support interaction mode CRUD (create, read, update, delete).
- FR-7: Each interaction mode must support association with multiple prompts.
- FR-8: Each interaction mode must support association with multiple skills.
- FR-9: The system must support marking one interaction mode as default.
- FR-10: The chat experience must support multi-thread history with create, rename, delete, and list.
- FR-11: Creating a thread must require selecting an active interaction mode.
- FR-12: Each thread must store mode configuration snapshot data for reproducibility.
- FR-13: Chat runtime must assemble system instructions from the thread’s mode prompts and skills.
- FR-14: Chat model invocation and streaming must use AI SDK APIs.
- FR-15: The app must integrate a shared RAG adapter based on `reference/rag-server` schema patterns.
- FR-16: RAG must be applied consistently across all interaction modes in v1.
- FR-17: Chat responses must support attached source citations from RAG results.
- FR-18: The chat UI must render streaming text, loading state, and error state.
- FR-19: The system must handle RAG unavailability gracefully without crashing the chat UI.
- FR-20: The system must provide deterministic logs/metadata for debugging mode behavior.
- FR-21: The solution must include local developer setup documentation with environment prerequisites.
- FR-22: Clerk authentication integration points must be isolated and replaceable, but not implemented in this phase.

## 5. Non-Goals (Out of Scope)

- Production authentication/authorization with Clerk.
- Role-based access controls beyond a simple admin stub.
- RAG ingestion UI, dataset upload UX, chunking controls, or index lifecycle management.
- Fine-tuning workflows, model training pipelines, or synthetic dataset management.
- Billing, subscriptions, or usage-based entitlements.
- Native mobile applications.

## 6. Design Considerations

- The chat UI should feel intentional and thematic to “Stoic counsel” without sacrificing readability.
- Interaction mode should be visible at all times in the active thread context.
- Admin forms should prioritize clarity for non-engineering operators managing prompts/skills.
- Source citation UI should be compact by default, expandable for detail.
- Ensure responsive behavior for desktop and mobile web.

## 7. Technical Considerations

- Use `ai-sdk` patterns from `reference/ai-sdk-showcase` for chat runtime, streaming, and server route structure.
- Keep AI provider access behind a small adapter module to prevent provider leakage across the codebase.
- Implement RAG integration as an explicit service boundary (for example: `lib/rag-client.ts` + server API route), modeled after `reference/rag-server` request/response contracts (`ChatRequest`, `ChatResponse`, `Source`, stream events).
- Normalize RAG responses so UI does not depend on backend-specific field naming changes.
- Use a persistence layer suitable for internal beta iteration (e.g., SQLite/Postgres with ORM), with clear migration support.
- Keep admin auth guard modular to allow Clerk replacement with minimal route/component changes.
- Ensure lint/typecheck/test commands are part of delivery criteria.

## 8. Success Metrics

- 100% of new conversations are started with a valid interaction mode selected.
- Admin can create a new interaction mode (with prompts + skills) in under 5 minutes.
- Thread CRUD success rate is at least 99% in internal testing sessions.
- At least 95% of assistant responses include properly attached retrieval metadata structure (sources list, including empty-list cases).
- Internal users can complete mode-comparison testing across at least 2 configured modes without code changes.

## 9. Open Questions

- Should end users be allowed to switch interaction mode mid-thread, or only on new-thread creation?
- What final ordering/precedence rules should apply when multiple prompts and multiple skills are attached to one mode?
- Should mode configuration support weighted/priority rules in v1, or simple ordered lists only?
- What minimum metadata is required for prompt/skill versioning in a later phase?
- Will RAG be deployed as a separate service from day one of beta, or proxied through the Next.js app during internal testing?

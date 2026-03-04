"""LLM service for generating responses."""

from collections.abc import AsyncGenerator

import structlog
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import RunnablePassthrough
from langchain_openai import ChatOpenAI

from app.config import Settings, get_settings
from app.models.schemas import RAGConfig
from app.services.rag import RAGService

# Default fallback prompt for when no system_prompt_override is provided
DEFAULT_SYSTEM_PROMPT = """You are a helpful AI assistant. Provide clear, accurate, and thoughtful responses.

You have full access to this conversation's history. When asked to reference, read back, or clarify previous messages, you CAN and SHOULD do so directly - quote or paraphrase your earlier responses as needed.

When responding to follow-up messages (like "thank you", "great", etc.), respond naturally and briefly - acknowledge the sentiment and offer any final thoughts if appropriate."""

logger = structlog.get_logger()


class LLMService:
    """Service for LLM interactions."""

    def __init__(
        self,
        settings: Settings | None = None,
        rag_service: RAGService | None = None,
    ):
        self.settings = settings or get_settings()
        self.rag_service = rag_service or RAGService(self.settings)
        self._models: dict = {}

    def _get_model(self, model_name: str | None = None, temperature: float | None = None):
        """Get or create an LLM instance."""
        model_name = model_name or self.settings.default_model
        
        # Use default temperature if not specified
        temp = temperature if temperature is not None else 0.7
        
        # Cache key includes parameters that affect instantiation
        cache_key = f"{model_name}_{temp}"

        if cache_key in self._models:
            return self._models[cache_key]

        if model_name.startswith("claude"):
            if not self.settings.anthropic_api_key:
                raise ValueError("Anthropic API key required for Claude models")
            model = ChatAnthropic(
                model=model_name,
                anthropic_api_key=self.settings.anthropic_api_key,
                temperature=temp,
                max_tokens=4096,
            )
        else:
            model = ChatOpenAI(
                model=model_name,
                openai_api_key=self.settings.openai_api_key,
                temperature=temp,
                max_tokens=4096,
            )

        self._models[cache_key] = model
        return model

    def _build_chain(self, model_name: str | None = None, system_prompt: str | None = None):
        """Build the RAG chain."""
        llm = self._get_model(model_name)

        # Use provided system prompt or default
        prompt_template = system_prompt or DEFAULT_SYSTEM_PROMPT
        prompt = ChatPromptTemplate.from_template(prompt_template)

        chain = (
            {
                "context": lambda x: self.rag_service.format_context(
                    self.rag_service.retrieve(x["question"])
                ),
                "question": RunnablePassthrough() | (lambda x: x["question"]),
            }
            | prompt
            | llm
            | StrOutputParser()
        )

        return chain

    def generate(
        self,
        question: str,
        model: str | None = None,
        conversation_history: list[dict] | None = None,
        use_rag: bool = True,  # Backward compatibility
        config: RAGConfig | None = None,
    ) -> tuple[str, list]:
        """Generate a response (non-streaming)."""
        
        # Resolve configuration
        rag_enabled = config.use_rag if config else use_rag
        temperature = config.temperature if config else None
        k = config.k if config else None
        active_model = config.model if config and config.model else model
        system_prompt_override = config.system_prompt_override if config else None

        has_history = bool(conversation_history and len(conversation_history) > 0)
        is_follow_up = self._is_follow_up_message(question, has_history)

        # For follow-up messages or when RAG is disabled, skip retrieval
        if is_follow_up:
            context = ""
            sources = []
            logger.info("skipping_rag_for_followup", question=question[:50])
        elif not rag_enabled:
            context = ""
            sources = []
            logger.info("skipping_rag_user_disabled", question=question[:50])
        else:
            context, sources = self.rag_service.retrieve_and_format(question, k=k)

        # Build messages list
        messages = []

        # Use provided system prompt or default
        system_prompt = system_prompt_override or DEFAULT_SYSTEM_PROMPT
        messages.append(SystemMessage(content=system_prompt))

        # Add conversation history with proper message types
        if conversation_history:
            for msg in conversation_history[-10:]:  # Last 10 turns
                if msg["role"] == "user":
                    messages.append(HumanMessage(content=msg["content"]))
                else:
                    messages.append(AIMessage(content=msg["content"]))

        # Add current question
        if is_follow_up:
            messages.append(HumanMessage(content=question))
        elif not rag_enabled:
            prompt_text = f"""User asks: {question}

Please respond."""
            messages.append(HumanMessage(content=prompt_text))
        else:
            prompt_text = f"""## Relevant Context
{context}

---

User asks: {question}

Please respond."""
            messages.append(HumanMessage(content=prompt_text))

        # Generate response
        llm = self._get_model(active_model, temperature=temperature)
        try:
            response = llm.invoke(messages)
            response_text = response.content if hasattr(response, "content") else str(response)

            logger.info(
                "generation_complete",
                question_length=len(question),
                response_length=len(response_text),
                sources_count=len(sources),
            )

            return response_text, sources

        except Exception as e:
            logger.error("generation_error", error=str(e))
            raise

    def _is_follow_up_message(self, question: str, has_history: bool) -> bool:
        """Check if this is a follow-up message that doesn't need RAG."""
        if not has_history:
            return False
        
        question_lower = question.lower().strip()
        
        # Phrases that reference previous conversation
        reference_phrases = [
            "your last", "you said", "you mentioned", "your previous",
            "the first", "the second", "the third", "point 1", "point 2", "point 3",
            "read back", "repeat", "say that again", "what you said",
            "elaborate", "expand on", "more about", "tell me more",
            "can you clarify", "what do you mean", "explain",
        ]
        for phrase in reference_phrases:
            if phrase in question_lower:
                return True
        
        # Short conversational messages
        conversational_indicators = [
            "thank", "thanks", "great", "ok", "okay", "got it", "understood",
            "perfect", "awesome", "cool", "nice", "yes", "no", "sure", "right",
            "interesting", "helpful", "good", "excellent", "wonderful",
            "i see", "makes sense", "noted", "appreciate",
        ]
        if len(question) < 80:
            for indicator in conversational_indicators:
                if indicator in question_lower:
                    return True
        
        return False

    async def generate_stream(
        self,
        question: str,
        model: str | None = None,
        conversation_history: list[dict] | None = None,
        use_rag: bool = True, # Backward compatibility
        config: RAGConfig | None = None,
    ) -> AsyncGenerator[tuple[str, list | None], None]:
        """Generate a streaming response."""
        
        # Resolve configuration
        rag_enabled = config.use_rag if config else use_rag
        temperature = config.temperature if config else None
        k = config.k if config else None
        active_model = config.model if config and config.model else model
        system_prompt_override = config.system_prompt_override if config else None

        has_history = bool(conversation_history and len(conversation_history) > 0)
        is_follow_up = self._is_follow_up_message(question, has_history)

        # For follow-up messages or explicit disable, skip RAG retrieval
        if is_follow_up:
            context = ""
            sources = []
            logger.info("skipping_rag_for_followup", question=question[:50])
        elif not rag_enabled:
            context = ""
            sources = []
            logger.info("skipping_rag_user_disabled", question=question[:50])
        else:
            # Get context and sources for substantive questions
            context, sources = self.rag_service.retrieve_and_format(question, k=k)

        # Build messages list
        messages = []

        # Use provided system prompt or default
        system_prompt = system_prompt_override or DEFAULT_SYSTEM_PROMPT
        messages.append(SystemMessage(content=system_prompt))

        # Add conversation history with proper message types
        if conversation_history:
            for msg in conversation_history[-10:]:  # Last 10 turns
                if msg["role"] == "user":
                    messages.append(HumanMessage(content=msg["content"]))
                else:
                    messages.append(AIMessage(content=msg["content"]))

        # Add current question
        if is_follow_up:
            # For follow-ups, just send the message directly
            messages.append(HumanMessage(content=question))
        elif not rag_enabled:
            prompt_text = f"""User asks: {question}

Please respond."""
            messages.append(HumanMessage(content=prompt_text))
        else:
            # For substantive questions, include RAG context
            prompt_text = f"""## Relevant Context
{context}

---

User asks: {question}

Please respond."""
            messages.append(HumanMessage(content=prompt_text))

        # Stream response
        llm = self._get_model(active_model, temperature=temperature)
        try:
            async for chunk in llm.astream(messages):
                content = chunk.content if hasattr(chunk, "content") else str(chunk)
                if content:
                    yield content, None

            # Yield sources at the end (empty for follow-ups)
            yield "", sources

        except Exception as e:
            logger.error("stream_error", error=str(e))
            raise


def get_llm_service() -> LLMService:
    """Dependency injection for LLMService."""
    return LLMService()

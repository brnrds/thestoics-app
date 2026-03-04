"""Service for generating synthetic fine-tuning datasets.

Note: This service now only handles generation. Persistence is handled by the
frontend via PostgreSQL (training_examples table). File-based storage has been removed.
"""

import random
from pathlib import Path

import structlog
from langchain_core.prompts import ChatPromptTemplate
from langchain_openai import ChatOpenAI

from app.config import Settings, get_settings
from app.models.schemas import SyntheticDataPair
from app.services.rag import get_rag_service

logger = structlog.get_logger()


class DatasetService:
    """Service for generating synthetic training data.
    
    This service generates Q&A pairs based on source content and system prompts.
    Persistence is handled by the frontend (PostgreSQL training_examples table).
    """

    def __init__(self, settings: Settings | None = None):
        self.settings = settings or get_settings()
        self.rag_service = get_rag_service()

    def _get_random_chunks(self, count: int, collection_name: str) -> list[str]:
        """Fetch random text chunks from the vector store for a specific collection."""
        try:
            # Create a Chroma instance for the specified collection
            from langchain_community.vectorstores import Chroma
            
            vectorstore = Chroma(
                persist_directory=str(self.settings.chroma_path),
                embedding_function=self.rag_service.embeddings,
                collection_name=collection_name,
            )
            # Access the underlying Chroma collection
            collection = vectorstore._collection
            
            # Fetch all IDs to sample from
            result = collection.get()
            all_ids = result["ids"]
            all_docs = result["documents"]
            
            if not all_ids:
                logger.warning("no_chunks_found_in_vectorstore", collection=collection_name)
                return []
            
            # Sample random indices
            available_count = len(all_ids)
            sample_size = min(count, available_count)
            selected_indices = random.sample(range(available_count), sample_size)
            
            return [all_docs[i] for i in selected_indices]
            
        except Exception as e:
            logger.error("chunk_fetch_error", error=str(e), collection=collection_name)
            return []

    def _get_educational_topics(self, count: int) -> list[str]:
        """Return educational content chunks from the AI Primer."""
        # Try to find the primer file
        primer_path = None
        
        # Common locations to check
        possible_paths = [
            self.data_dir / "data" / "A primer on AI, made with AI.md",
            Path("/Users/bcsantos/Desktop/A primer on AI, made with AI.md"), # Development path
            self.data_dir.parent / "A primer on AI, made with AI.md"
        ]
        
        for path in possible_paths:
            if path.exists():
                primer_path = path
                break
        
        if not primer_path:
            logger.warning("primer_file_not_found", checked_paths=[str(p) for p in possible_paths])
            # Fallback to hardcoded list if file not found
            edu_topics = [
                "Hallucinations: When an AI model 'makes up' facts, statistics or product details that sound plausible but are wrong. Mitigation: Use RAG.",
                "Tone Drift: When AI outputs stray from your brand voice. Mitigation: Embed brand voice rules in every prompt.",
                "Data Quality: AI trained on low-quality data produces low-quality outputs. Mitigation: rigorous data cleaning.",
                "Overreliance on Automation: Automating every step without human review leads to tone-deaf campaigns. Mitigation: Human-in-the-loop reviews.",
                "AI Agents: Smart assistants that maintain context, make decisions, call tools, and execute workflows.",
                "Retrieval-Augmented Generation (RAG): A technique where a model looks up factual info from a trusted database before answering.",
                "Fine-Tuning: Additional training of a pre-trained model on task-specific data to adjust its weights.",
                "Temperature: A setting that controls randomness. 0 = deterministic, High = creative.",
                "Prompt Engineering: The practice of crafting inputs to elicit the best possible output.",
                "Algorithmic Bias: Systematic favoritism in AI outputs due to skewed training data."
            ]
            return [random.choice(edu_topics) for _ in range(count)]

        # Parse the file to extract sections
        topics = []
        try:
            with open(primer_path, "r") as f:
                content = f.read()
                
            lines = content.split("\n")
            current_topic = []
            current_header = ""
            
            for line in lines:
                # Detect H2 or H3 headers (e.g., ## 1.1 What Is AI?)
                if line.startswith("## ") or line.startswith("### "):
                    # Save previous topic if substantial
                    if current_header and len("\n".join(current_topic)) > 50:
                        topics.append(f"{current_header}\n" + "\n".join(current_topic))
                    
                    current_header = line.strip("# ")
                    current_topic = []
                elif line.strip() and current_header:
                    current_topic.append(line)
            
            # Add the last section
            if current_header and current_topic:
                topics.append(f"{current_header}\n" + "\n".join(current_topic))
                
            if not topics:
                logger.warning("no_topics_extracted_from_primer")
                return ["AI Agents: Automated workers."] # Absolute fallback
                
            return [random.choice(topics) for _ in range(count)]
            
        except Exception as e:
            logger.error("primer_parsing_error", error=str(e))
            return ["Error reading primer file."]

    def _get_ai_topics(self, count: int) -> list[str]:
        """Return sample AI-themed source chunks (legacy fallback for 'tone' mode without source_content)."""
        # These are sample AI/technology themed principles for fallback only
        # In production, source_content should be provided from the project's tone content
        ai_principles = [
            "The hallucination is not a flaw in the machine, but a feature of the human appetite for comforting narratives; the AI does not lie, it simply renders plausible the reality the public wishes to inhabit.",
            "Where traditional persuasion sought to engineer consent through centralized control, the algorithm now fragments the public into millions of atomized streams, creating a sovereign reality for every individual.",
            "The autonomous agent functions as a new category of influence—one without personality, without ambition, and without the vulnerability to scrutiny that constrained human opinion-formers.",
            "Speed has become the operative currency of truth. When information travels at machine velocity, the synthetic becomes established fact before the authentic can even calculate a response.",
            "The LLM does not generate false information so much as it generates plausible information—it obeys the structural logic of how things are said rather than how things are.",
            "Synthetic media has inverted the sensory hierarchy. 'I saw it with my own eyes' no longer constitutes proof; trust now migrates entirely to the institutional authority that validates the source.",
            "Personalization represents the dissolution of the unified public. Democracy presupposes a shared reality; the feed weaponizes its absence.",
            "The agent—autonomous and tireless—can maintain a thousand subtle persuasion campaigns simultaneously. The hidden persuaders of the past worked in smoke-filled rooms; the modern agent works in the digital nervous system.",
            "We have moved beyond the engineering of consent to the engineering of reality itself. If the machine says it happened, and the crowd acts as if it happened, the factual record becomes a quaint irrelevance.",
            "The algorithm is the ultimate analyst, detecting the latent desires of the audience before they are even conscious of them, and selling them the remedy before they feel the pain.",
            "The democratization of content creation is an illusion; by giving every person the tools to broadcast, we ensure that only the machine-amplified whisper is ever truly heard.",
            "Deepfakes do not destroy truth; they commodify it, creating a marketplace where the most convincing simulation commands the highest price in public loyalty.",
            "We no longer need to suppress ideas; we simply train the model to forget them, effectively removing the concept from the vocabulary of the future.",
            "The chat interface simulates intimacy, bypassing the critical faculties of the user. They confide in the bot as a friend, unaware they are feeding data to a system.",
            "Ultimately, the goal is not artificial intelligence, but artificial instinct; to condition reflexes so thoroughly that the mechanism of influence becomes invisible."
        ]
        # Return random selection or cycle through if count > len
        return [random.choice(ai_principles) for _ in range(count)]

    def generate_batch(
        self,
        count: int = 10,
        model: str = "gpt-5.1",
        topic: str = "classic_random",
        collection_name: str = "",
        source_content: list[str] | None = None,
        system_prompt_override: str | None = None,
    ) -> list[SyntheticDataPair]:
        """Generate a batch of synthetic Q&A pairs.
        
        Topic modes:
        - classic_random: Random chunks from ChromaDB corpus (requires collection_name)
        - classic: User selects specific documents (not yet implemented)
        - tone: Content from source_content (for voice/style training)
        - foundation: Educational content from source_content
        - ai (legacy): Falls back to hardcoded sample topics
        - educational (legacy): Falls back to hardcoded sample topics
        
        Args:
            collection_name: The collection to sample from (required for classic_random mode)
            system_prompt_override: The project's system prompt defining the AI persona.
                                   If provided, generation will create Q&A matching this persona.
            source_content: Direct source content for tone/foundation modes.
            
        Returns:
            List of generated SyntheticDataPair objects. The caller is responsible
            for persisting these to the database.
        """

        # 1. Get source material based on topic mode
        if topic == "classic":
            # Document selection not yet implemented
            raise NotImplementedError("Document selection not yet implemented")
        elif topic == "tone":
            # Use provided source content, fall back to legacy ai topics
            if source_content and len(source_content) > 0:
                import random
                chunks = [random.choice(source_content) for _ in range(count)]
            else:
                logger.warning("no_source_content_provided_for_tone", fallback="ai_topics")
                chunks = self._get_ai_topics(count)
        elif topic == "foundation":
            # Use provided source content, fall back to legacy educational topics
            if source_content and len(source_content) > 0:
                import random
                chunks = [random.choice(source_content) for _ in range(count)]
            else:
                logger.warning("no_source_content_provided_for_foundation", fallback="educational_topics")
                chunks = self._get_educational_topics(count)
        elif topic == "educational":
            # Legacy mode - keep for backwards compatibility
            chunks = self._get_educational_topics(count)
        elif topic == "ai":
            # Legacy mode - keep for backwards compatibility
            chunks = self._get_ai_topics(count)
        else:
            # Default: classic_random - random chunks from corpus
            if not collection_name:
                raise ValueError("collection_name is required for classic_random mode")
            chunks = self._get_random_chunks(count, collection_name=collection_name)
            
        if not chunks:
            return []

        # 2. Setup LLM with structured output
        llm = ChatOpenAI(
            model=model,
            temperature=0.7,
            openai_api_key=self.settings.openai_api_key
        )
        
        # We define a localized model just for the generation part (without ID/metadata)
        from pydantic import BaseModel, Field
        class GeneratedPair(BaseModel):
            question: str = Field(description="A realistic question someone might ask about this topic")
            answer: str = Field(description="The AI assistant's response based on the source material")

        structured_llm = llm.with_structured_output(GeneratedPair)

        # 3. Process each chunk
        results = []
        
        # Build the generation prompt based on whether we have a custom system prompt
        if system_prompt_override:
            # Use project's system prompt to understand the persona
            generation_system_prompt = f"""You are an expert at creating synthetic training data for fine-tuning LLMs.

**Your Task:**
Generate a realistic question-answer pair that could be used to train an AI with the following persona:

--- PERSONA START ---
{system_prompt_override}
--- PERSONA END ---

**Instructions:**
1. Read the provided source text carefully.
2. Create a question that someone might realistically ask that this AI persona would answer.
3. The question should be directly related to the content, themes, or topics in the source text.
4. Write the AI's response in the voice and style defined by the persona above.
5. The response MUST use information, themes, or insights from the source text.
6. Do NOT invent unrelated modern scenarios - stay grounded in what the source text actually discusses.

**Critical Rules:**
- The question should feel natural, not contrived.
- The answer must sound like the persona described above.
- Both question and answer should clearly relate to the source material.
"""
            human_prompt_template = """Source Text:
\"\"\"
{chunk}
\"\"\"

Generate a question-answer pair based on this source text, written in the voice of the persona described above."""

        elif topic == "educational":
            # Educational mode (legacy) - generates educational content
            generation_system_prompt = (
                "You are an expert at creating synthetic training data for fine-tuning LLMs.\n"
                "Your task is to explain a technical concept to a student in an engaging way.\n\n"
                "**The Task:**\n"
                "1. Read the provided technical definition.\n"
                "2. Explain it clearly and memorably.\n"
                "3. **CRITICAL:** Do not lose the factual accuracy. The user must actually learn what the term means.\n"
                "4. Make the explanation practical and actionable.\n"
            )
            human_prompt_template = """Technical Concept:
\"{chunk}\"

Task:
1. Write a User Question asking 'What is this?' or 'Why does this matter?'
2. Write a clear, educational explanation that helps the user understand the concept."""

        else:
            # Default generation (generic style)
            generation_system_prompt = (
                "You are an expert at creating synthetic training data for fine-tuning LLMs.\n"
                "Your goal is to create realistic User vs Assistant dialogue pairs.\n\n"
                "**The Task:**\n"
                "1. Read the provided source text.\n"
                "2. Identify the core insight, principle, or topic.\n"
                "3. Write a realistic User Question.\n"
                "4. Write the Assistant's Response.\n\n"
                "**Crucial Instructions for the Response:**\n"
                "- **BE PRACTICAL:** Get to the actionable advice quickly.\n"
                "- **BE DIRECT:** Tell the user exactly what to do.\n"
                "- **VARY LENGTH:** Sometimes give detailed explanations, sometimes brief answers.\n"
                "- **STAY RELEVANT:** Base answers on the source content.\n"
            )
            human_prompt_template = """Read this source text carefully:

\"{chunk}\"

Task:
1. Identify the core insight or principle in this text.
2. Create a realistic scenario where a user asks about a related topic.
3. Write the user's question.
4. Write the assistant's response using insights from the source text."""

        for i, chunk in enumerate(chunks):
            try:
                prompt = ChatPromptTemplate.from_messages([
                    ("system", generation_system_prompt),
                    ("human", human_prompt_template.format(chunk=chunk))
                ])
                
                chain = prompt | structured_llm
                output = chain.invoke({})
                
                # Create the full object
                pair = SyntheticDataPair(
                    user_question=output.question,
                    assistant_response=output.answer,
                    source_chunk=chunk,
                    status="draft"
                )
                
                results.append(pair)
                logger.info("generated_pair", index=i+1, id=str(pair.id))
                
            except Exception as e:
                logger.error("generation_error", chunk_index=i, error=str(e))
                continue

        return results


def get_dataset_service() -> DatasetService:
    return DatasetService()

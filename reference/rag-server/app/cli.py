#!/usr/bin/env python3
"""CLI for managing the Model Forge application."""

import argparse
import sys
from pathlib import Path

# Add the backend directory to the path
sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv

load_dotenv()

import time
from openai import OpenAI
from app.services.ingest import IngestService
from app.services.dataset import DatasetService


def cmd_ingest(args):
    """Run document ingestion."""
    print("=" * 60)
    print("  Model Forge Document Ingestion")
    print("=" * 60)

    service = IngestService()
    data_dir = Path(args.directory) if args.directory else None

    if data_dir and not data_dir.exists():
        print(f"Error: Directory not found: {data_dir}")
        sys.exit(1)

    result = service.ingest(data_dir)

    print(f"\nStatus: {result['status']}")
    print(f"Files processed: {result['files_processed']}")
    print(f"Chunks created: {result['chunks_created']}")

    if result['errors']:
        print("\nErrors:")
        for error in result['errors']:
            print(f"  - {error}")

    print("\n" + "=" * 60)


def cmd_list(args):
    """List indexed documents."""
    print("=" * 60)
    print("  Indexed Documents")
    print("=" * 60)

    service = IngestService()
    stats = service.get_document_stats()

    if not stats['documents']:
        print("\nNo documents indexed yet.")
        print("Run: python -m app.cli ingest")
    else:
        print(f"\nTotal chunks: {stats['total_chunks']}\n")
        for doc in stats['documents']:
            print(f"  📄 {doc['filename']}: {doc['chunks']} chunks")

    print("\n" + "=" * 60)


def cmd_clear(args):
    """Clear the vector store."""
    if not args.yes:
        confirm = input("Are you sure you want to clear the vector store? [y/N] ")
        if confirm.lower() != 'y':
            print("Cancelled.")
            return

    service = IngestService()
    success = service.clear_vector_store()

    if success:
        print("Vector store cleared successfully.")
    else:
        print("Failed to clear vector store.")
        sys.exit(1)


def cmd_generate(args):
    """Generate synthetic training data."""
    print("=" * 60)
    print("  Model Forge Synthetic Data Generator")
    print("=" * 60)

    # Safety check for budget
    if args.count > 100:
        print("Warning: Capped at 100 to stay within budget.")
    
    count = min(args.count, 100)
    collection = args.collection or "default"
    
    print(f"Generating {count} pairs using {args.model} ({args.topic})...")
    print(f"Collection: {collection}")
    print("This may take a minute...")
    
    service = DatasetService()
    results = service.generate_batch(
        count=count, 
        model=args.model, 
        topic=args.topic, 
        collection_name=collection
    )
    
    print(f"\nSuccessfully generated {len(results)} pairs.")
    print("Note: Results are returned but not saved - use the API for persistence.")
    print("\n" + "=" * 60)


def cmd_export(args):
    """Export the dataset to OpenAI format."""
    print("=" * 60)
    print("  Model Forge Dataset Export")
    print("=" * 60)
    
    # Run the export logic (imported from export_for_openai.py)
    # Since export_for_openai is a script, we'll import its main logic here or call it
    # Ideally, we should move the logic to a service, but for now we'll import the module
    import importlib.util
    spec = importlib.util.spec_from_file_location("export_module", Path(__file__).parent.parent / "export_for_openai.py")
    if spec and spec.loader:
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        if hasattr(module, "main"):
             module.main()
    else:
        print("Error loading export script")

    print("\n" + "=" * 60)


def cmd_monitor(args):
    """Monitor fine-tuning job status."""
    print("=" * 60)
    print("  Model Forge Fine-Tuning Monitor")
    print("=" * 60)
    print(f"Monitoring job: {args.job_id}")
    
    client = OpenAI()
    
    try:
        start_time = time.time()
        while True:
            # Retrieve job status
            job = client.fine_tuning.jobs.retrieve(args.job_id)
            status = job.status
            
            # Build status message
            msg = f"\rStatus: {status}"
            if job.trained_tokens:
                msg += f" | Tokens: {job.trained_tokens}"
            if job.estimated_finish:
                try:
                    # Convert Unix timestamp to readable relative time
                    eta_seconds = int(job.estimated_finish) - time.time()
                    if eta_seconds > 0:
                        mins, secs = divmod(int(eta_seconds), 60)
                        msg += f" | ETA: {mins}m {secs}s"
                    else:
                        msg += " | Finishing up..."
                except:
                    msg += f" | ETA: {job.estimated_finish}"
            elif status == "running":
                 msg += " | ETA: Calculating..."
                
            # Print with carriage return to update line
            sys.stdout.write(msg)
            sys.stdout.flush()
            
            # Check terminal states
            if status in ["succeeded", "failed", "cancelled"]:
                print(f"\n\nJob finished with status: {status}")
                if status == "succeeded":
                    print(f"Fine-tuned model: {job.fine_tuned_model}")
                elif status == "failed":
                    print(f"Error: {job.error}")
                break
                
            time.sleep(20)
            
    except KeyboardInterrupt:
        print("\nMonitoring stopped by user.")
    except Exception as e:
        print(f"\nError retrieving job: {e}")
    
    print("\n" + "=" * 60)


def main():
    parser = argparse.ArgumentParser(
        description="Model Forge CLI - Fine-tuning and data generation tools",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )

    subparsers = parser.add_subparsers(dest="command", help="Commands")

    # Ingest command
    ingest_parser = subparsers.add_parser("ingest", help="Ingest documents into vector store")
    ingest_parser.add_argument(
        "-d", "--directory",
        help="Directory containing documents (default: ./data)",
    )
    ingest_parser.set_defaults(func=cmd_ingest)

    # List command
    list_parser = subparsers.add_parser("list", help="List indexed documents")
    list_parser.set_defaults(func=cmd_list)

    # Clear command
    clear_parser = subparsers.add_parser("clear", help="Clear the vector store")
    clear_parser.add_argument(
        "-y", "--yes",
        action="store_true",
        help="Skip confirmation prompt",
    )
    clear_parser.set_defaults(func=cmd_clear)

    # Generate command
    gen_parser = subparsers.add_parser("generate-data", help="Generate synthetic training data")
    gen_parser.add_argument(
        "-c", "--count",
        type=int,
        default=10,
        help="Number of examples to generate (max 100)",
    )
    gen_parser.add_argument(
        "-m", "--model",
        type=str,
        default="gpt-5.1",
        help="Model to use for generation",
    )
    gen_parser.add_argument(
        "-t", "--topic",
        type=str,
        default="classic_random",
        choices=["classic_random", "tone", "foundation", "ai", "educational"],
        help="Topic source: 'classic_random' (RAG), 'tone' (style content), 'foundation' (educational), 'ai' (legacy), 'educational' (legacy)",
    )
    gen_parser.add_argument(
        "--collection",
        type=str,
        default="default",
        help="Collection name to sample from (for classic_random mode)",
    )
    gen_parser.set_defaults(func=cmd_generate)

    # Export command
    export_parser = subparsers.add_parser("export-data", help="Export dataset for OpenAI fine-tuning")
    export_parser.set_defaults(func=cmd_export)

    # Monitor command
    monitor_parser = subparsers.add_parser("monitor", help="Monitor fine-tuning job status")
    monitor_parser.add_argument(
        "--job-id",
        required=True,
        help="ID of the fine-tuning job to monitor",
    )
    monitor_parser.set_defaults(func=cmd_monitor)

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        sys.exit(1)

    args.func(args)


if __name__ == "__main__":
    main()

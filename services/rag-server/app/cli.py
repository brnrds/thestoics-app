#!/usr/bin/env python3
"""CLI for managing the RAG backend."""

import argparse
import sys
from pathlib import Path

# Add backend directory to import path
sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv

load_dotenv()

from app.services.ingest import IngestService


def cmd_ingest(args):
    """Run directory ingestion."""
    print("=" * 60)
    print("  Stoics RAG Ingestion")
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

    if result["errors"]:
        print("\nErrors:")
        for error in result["errors"]:
            print(f"  - {error}")

    print("\n" + "=" * 60)


def cmd_ingest_file(args):
    """Run single-file ingestion."""
    file_path = Path(args.file)
    if not file_path.exists():
        print(f"Error: File not found: {file_path}")
        sys.exit(1)

    service = IngestService()
    result = service.ingest_file(file_path)

    print(f"Status: {result['status']}")
    print(f"Files processed: {result['files_processed']}")
    print(f"Chunks created: {result['chunks_created']}")

    if result["errors"]:
        print("Errors:")
        for error in result["errors"]:
            print(f"  - {error}")


def cmd_list(_args):
    """List indexed documents."""
    print("=" * 60)
    print("  Indexed Documents")
    print("=" * 60)

    service = IngestService()
    stats = service.get_document_stats()

    if not stats["documents"]:
        print("\nNo documents indexed yet.")
        print("Run: python -m app.cli ingest")
    else:
        print(f"\nTotal chunks: {stats['total_chunks']}\n")
        for doc in stats["documents"]:
            print(f"  - {doc['filename']}: {doc['chunks']} chunks")

    print("\n" + "=" * 60)


def cmd_clear(args):
    """Clear the vector store."""
    if not args.yes:
        confirm = input("Are you sure you want to clear the vector store? [y/N] ")
        if confirm.lower() != "y":
            print("Cancelled.")
            return

    service = IngestService()
    success = service.clear_vector_store()

    if success:
        print("Vector store cleared successfully.")
    else:
        print("Failed to clear vector store.")
        sys.exit(1)


def main():
    parser = argparse.ArgumentParser(
        description="Stoics RAG CLI",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )

    subparsers = parser.add_subparsers(dest="command", help="Commands")

    ingest_parser = subparsers.add_parser("ingest", help="Ingest a directory into vector store")
    ingest_parser.add_argument(
        "-d",
        "--directory",
        help="Directory containing documents (default: DATA_PATH env or repo root)",
    )
    ingest_parser.set_defaults(func=cmd_ingest)

    file_parser = subparsers.add_parser("ingest-file", help="Ingest a single file")
    file_parser.add_argument("--file", required=True, help="Path to file to ingest")
    file_parser.set_defaults(func=cmd_ingest_file)

    list_parser = subparsers.add_parser("list", help="List indexed documents")
    list_parser.set_defaults(func=cmd_list)

    clear_parser = subparsers.add_parser("clear", help="Clear the vector store")
    clear_parser.add_argument(
        "-y",
        "--yes",
        action="store_true",
        help="Skip confirmation prompt",
    )
    clear_parser.set_defaults(func=cmd_clear)

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        sys.exit(1)

    args.func(args)


if __name__ == "__main__":
    main()

import sys
from pathlib import Path

# Add the backend directory to the path
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.services.dataset import DatasetService

def main():
    print("=" * 60)
    print("  WWBD Draft Auto-Approver")
    print("=" * 60)

    service = DatasetService()
    
    if not service.drafts_file.exists():
        print("No drafts file found.")
        sys.exit(0)

    drafts = service.get_drafts()
    count = len(drafts)
    
    print(f"Found {count} pending drafts.")
    
    if count == 0:
        print("Nothing to approve.")
        sys.exit(0)

    print("Approving all drafts directly via backend service...")
    
    # We can optimize this by doing file operations in bulk instead of one by one
    # but for reliability we'll use the service method or a bulk variant
    
    success_count = 0
    
    # Bulk approve logic to avoid O(N^2) file rewriting
    # 1. Read all drafts
    # 2. Set status to approved
    # 3. Append all to dataset file
    # 4. Clear drafts file
    
    try:
        # Filter valid drafts
        valid_drafts = [d for d in drafts if d.status == "draft"]
        
        # Update status
        for d in valid_drafts:
            d.status = "approved"
            
        # Append to dataset file
        with open(service.dataset_file, "a") as f:
            for d in valid_drafts:
                f.write(d.model_dump_json() + "\n")
                success_count += 1
        
        # Clear drafts file
        with open(service.drafts_file, "w") as f:
            f.write("")
            
        print(f"Successfully approved {success_count} drafts.")
        
    except Exception as e:
        print(f"Error during bulk approval: {e}")
        sys.exit(1)

    print("\n" + "=" * 60)

if __name__ == "__main__":
    main()

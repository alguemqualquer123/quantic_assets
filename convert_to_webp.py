import os
import argparse
from PIL import Image

# Directories to scan
TARGET_DIRS = ['assets', 'branding', 'clothing', 'dui', 'props']
# Extensions to convert
IMAGE_EXTENSIONS = {'.jpg', '.jpeg', '.png'}
# Files to ignore (e.g. if we want to skip specific files)
IGNORE_FILES = set()

def convert_image(file_path, delete_original=False):
    """Converts a single image to WebP."""
    try:
        filename, ext = os.path.splitext(file_path)
        webp_path = f"{filename}.webp"

        # Skip if WebP already exists
        if os.path.exists(webp_path):
            # print(f"Skipping (WebP exists): {file_path}")
            return False

        print(f"Converting: {file_path} -> {webp_path}")

        with Image.open(file_path) as img:
            # Convert to RGB if necessary (e.g. for PNG with transparency being saved as JPEG, though WebP handles RGBA)
            # WebP supports RGBA, so usually no need to convert mode unless it's CMYK or something weird.
            img.save(webp_path, 'WEBP')

        if delete_original:
            print(f"Deleting original: {file_path}")
            os.remove(file_path)

        return True
    except Exception as e:
        print(f"Error converting {file_path}: {e}")
        return False

def scan_and_convert(root_dir, delete_originals=False):
    """Scans directories and converts images."""
    converted_count = 0

    for target_dir in TARGET_DIRS:
        full_path = os.path.join(root_dir, target_dir)
        if not os.path.exists(full_path):
            print(f"Directory not found, skipping: {full_path}")
            continue

        print(f"Scanning directory: {full_path}")
        for root, _, files in os.walk(full_path):
            for file in files:
                if file in IGNORE_FILES:
                    continue

                _, ext = os.path.splitext(file)
                if ext.lower() in IMAGE_EXTENSIONS:
                    file_path = os.path.join(root, file)
                    if convert_image(file_path, delete_originals):
                        converted_count += 1

    print(f"\nTotal images converted: {converted_count}")

def main():
    parser = argparse.ArgumentParser(description="Convert images to WebP recursively.")
    parser.add_argument('--root', default='.', help='Root directory to scan (default: current dir)')
    parser.add_argument('--delete-originals', action='store_true', help='Delete original files after conversion')

    args = parser.parse_args()

    print(f"Starting conversion script...")
    print(f"Root: {os.path.abspath(args.root)}")
    print(f"Delete originals: {args.delete_originals}")

    scan_and_convert(args.root, args.delete_originals)

if __name__ == '__main__':
    main()

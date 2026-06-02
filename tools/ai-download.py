#!/usr/bin/env python3
"""
Simple model downloader using huggingface_hub.snapshot_download

Edit the constants below to point to desired model IDs and destination paths.
Requirements:
  pip install huggingface-hub

Notes:
 - Large models require substantial disk space. Hugging Face authentication may be required for some models.
 - This script downloads the full repository snapshot to the destination directory.
"""

import os
import sys
import time
from huggingface_hub import snapshot_download

# MODEL IDs (change if you prefer different variants)
CODELLAMA_ID = "codellama/CodeLlama-34b-Instruct"
STARCODER_ID = "bigcode/starcoder"

# Destination paths (set to where you want the models stored)
CODELLAMA_PATH = r"D:\model\codellama"
STARCODER_PATH = r"D:\model\starcoder"

# Worker threads for parallel downloads (increase on fast connections)
MAX_WORKERS = 8


def sizeof_fmt(num, suffix='B'):
    for unit in ['','K','M','G','T','P']:
        if abs(num) < 1024.0:
            return f"{num:3.1f}{unit}{suffix}"
        num /= 1024.0
    return f"{num:.1f}P{suffix}"


def folder_size(path):
    total = 0
    for dirpath, dirnames, filenames in os.walk(path):
        for f in filenames:
            fp = os.path.join(dirpath, f)
            try:
                total += os.path.getsize(fp)
            except Exception:
                pass
    return total


def ensure_dir(path):
    os.makedirs(path, exist_ok=True)


def download_model(repo_id: str, dest: str):
    print(f"Downloading {repo_id} -> {dest}")
    ensure_dir(dest)
    start = time.time()
    try:
        # snapshot_download will place files under the cache or local_dir
        snapshot_download(repo_id=repo_id, local_dir=dest, local_dir_use_symlinks=False, allow_patterns=None, max_workers=MAX_WORKERS)
    except Exception as e:
        print(f"Download failed for {repo_id}: {e}")
        return False
    elapsed = time.time() - start
    size = folder_size(dest)
    print(f"Finished {repo_id} in {elapsed:.1f}s — size: {sizeof_fmt(size)}")
    return True


def main():
    print("Model downloader utility — ensure you have enough disk space before running.")
    print("Estimating required disk space (approx):")
    print(" - CodeLlama-34b-Instruct: ~70-150 GB depending on format (fp32 vs quantized/ggml).")
    print(" - StarCoder (15B family): ~20-60 GB depending on variant and file formats.")
    print()

    # Basic sanity checks
    if not os.path.isabs(CODELLAMA_PATH) or not os.path.isabs(STARCODER_PATH):
        print("Destination paths must be absolute. Edit the CODELLAMA_PATH and STARCODER_PATH constants.")
        sys.exit(2)

    # Download models sequentially
    ok1 = download_model(CODELLAMA_ID, CODELLAMA_PATH)
    ok2 = download_model(STARCODER_ID, STARCODER_PATH)

    if ok1 and ok2:
        print("All downloads completed.")
        print(f"CodeLlama dir size: {sizeof_fmt(folder_size(CODELLAMA_PATH))}")
        print(f"StarCoder dir size: {sizeof_fmt(folder_size(STARCODER_PATH))}")
    else:
        print("One or more downloads failed. Check output above for errors.")


if __name__ == '__main__':
    main()

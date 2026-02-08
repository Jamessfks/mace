"use client";

import { useCallback } from "react";
import { Upload, X, File } from "lucide-react";

interface FileUploadSectionProps {
  files: File[];
  onFilesChange: (files: File[]) => void;
}

const ACCEPTED_FORMATS = [".xyz", ".cif", ".poscar", ".contcar", ".pdb"];

/** Vercel serverless request body limit; stay under to avoid FUNCTION_PAYLOAD_TOO_LARGE */
const MAX_TOTAL_SIZE_BYTES = 4 * 1024 * 1024; // 4 MB (Vercel limit is 4.5 MB)

export function getTotalFilesSize(files: File[]): number {
  return files.reduce((sum, f) => sum + f.size, 0);
}

export function isOverSizeLimit(files: File[]): boolean {
  return getTotalFilesSize(files) > MAX_TOTAL_SIZE_BYTES;
}

export function FileUploadSection({
  files,
  onFilesChange,
}: FileUploadSectionProps) {
  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const droppedFiles = Array.from(e.dataTransfer.files);
      onFilesChange([...files, ...droppedFiles]);
    },
    [files, onFilesChange]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) {
        const selectedFiles = Array.from(e.target.files);
        onFilesChange([...files, ...selectedFiles]);
      }
    },
    [files, onFilesChange]
  );

  const removeFile = (index: number) => {
    onFilesChange(files.filter((_, i) => i !== index));
  };

  return (
    <div className="rounded-lg border border-matrix-green/20 bg-black/80 p-6">
      <h2 className="mb-4 font-mono text-sm font-bold text-matrix-green">
        UPLOAD STRUCTURE
      </h2>

      {/* Drag & Drop Zone */}
      <div
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        className="group relative cursor-pointer rounded-lg border-2 border-dashed border-matrix-green/30 bg-matrix-green/5 p-12 text-center transition-colors hover:border-matrix-green/50 hover:bg-matrix-green/10"
      >
        <input
          type="file"
          multiple
          accept={ACCEPTED_FORMATS.join(",")}
          onChange={handleFileInput}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
        <Upload className="mx-auto mb-3 h-12 w-12 text-matrix-green/60" />
        <p className="mb-1 font-mono text-sm text-zinc-300">
          Drag & drop structure files here
        </p>
        <p className="font-mono text-xs text-zinc-500">
          or click to browse
        </p>
        <p className="mt-2 font-mono text-xs text-zinc-600">
          Supported: {ACCEPTED_FORMATS.join(", ")}
        </p>
      </div>

      {/* Size limit warning (Vercel 4.5 MB limit) */}
      {files.length > 0 && (
        <div className="mt-4 font-mono text-xs text-zinc-500">
          Total size: {(getTotalFilesSize(files) / 1024).toFixed(1)} KB
          {isOverSizeLimit(files) && (
            <p className="mt-1 text-amber-400">
              Over 4 MB — request will fail on Vercel. Use fewer/smaller files.
            </p>
          )}
        </div>
      )}

      {/* File List */}
      {files.length > 0 && (
        <div className="mt-4 space-y-2">
          <h3 className="font-mono text-xs text-zinc-500">
            Uploaded Files ({files.length})
          </h3>
          {files.map((file, index) => (
            <div
              key={`${file.name}-${index}`}
              className="flex items-center justify-between rounded border border-matrix-green/20 bg-black/50 p-3"
            >
              <div className="flex items-center gap-3">
                <File className="h-4 w-4 text-matrix-green/80" />
                <div>
                  <p className="font-mono text-xs text-zinc-300">
                    {file.name}
                  </p>
                  <p className="font-mono text-xs text-zinc-600">
                    {(file.size / 1024).toFixed(1)} KB
                  </p>
                </div>
              </div>
              <button
                onClick={() => removeFile(index)}
                className="text-zinc-500 transition-colors hover:text-red-400"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

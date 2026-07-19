"use client";

import React, { useState, useCallback, useRef } from "react";
import { UploadCloud, X, Loader2, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface FileUploaderProps {
  value: string[];
  onChange: (urls: string[]) => void;
  maxFiles?: number;
}

export default function FileUploader({ value = [], onChange, maxFiles = 10 }: FileUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const uploadFile = async (file: File) => {
    try {
      if (value.length >= maxFiles) {
        alert(`You can only upload up to ${maxFiles} images.`);
        return;
      }
      
      if (!file.type.startsWith("image/")) {
        alert("Only image files are allowed.");
        return;
      }
      
      if (file.size > 4 * 1024 * 1024) {
        alert("File size must be less than 4MB.");
        return;
      }

      setIsUploading(true);
      setUploadProgress(10);

      // 1. Get presigned URL from our API
      const res = await fetch("/api/upload/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to get upload URL");
      }

      const { signedUrl, publicUrl } = await res.json();
      setUploadProgress(40);

      // 2. Upload file directly to S3 using the presigned URL
      const uploadRes = await fetch(signedUrl, {
        method: "PUT",
        headers: {
          "Content-Type": file.type,
        },
        body: file,
      });

      if (!uploadRes.ok) {
        throw new Error("Failed to upload file to S3");
      }

      setUploadProgress(100);
      
      // 3. Add the public URL to our form state
      onChange([...value, publicUrl]);
      
    } catch (error: any) {
      console.error("Upload error:", error);
      alert(error.message || "Failed to upload image.");
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      // For simplicity in this demo, we upload the first dropped file
      // A robust implementation would queue them up
      uploadFile(files[0]);
    }
  }, [value, onChange, maxFiles]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      uploadFile(files[0]);
    }
  };

  const removeFile = (indexToRemove: number) => {
    const newUrls = [...value];
    newUrls.splice(indexToRemove, 1);
    onChange(newUrls);
  };

  return (
    <div className="space-y-4">
      {/* Upload Zone */}
      <div 
        className={`border-2 border-dashed rounded-2xl p-8 text-center transition-colors cursor-pointer ${
          isDragging 
            ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20" 
            : "border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50"
        } ${isUploading ? "opacity-50 pointer-events-none" : ""}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input 
          type="file" 
          ref={fileInputRef} 
          onChange={handleFileSelect} 
          accept="image/png, image/jpeg, image/webp" 
          className="hidden" 
        />
        
        {isUploading ? (
          <div className="flex flex-col items-center justify-center space-y-3">
            <Loader2 className="w-10 h-10 text-indigo-500 animate-spin" />
            <div className="text-sm font-medium text-slate-700 dark:text-slate-300">Uploading to AWS S3... {uploadProgress}%</div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center space-y-3">
            <div className="p-4 bg-indigo-100 dark:bg-indigo-900/50 rounded-full text-indigo-600 dark:text-indigo-400">
              <UploadCloud className="w-8 h-8" />
            </div>
            <div>
              <p className="text-base font-medium text-slate-900 dark:text-white">Click to upload or drag and drop</p>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">SVG, PNG, JPG or WEBP (max. 4MB)</p>
            </div>
          </div>
        )}
      </div>

      {/* Gallery Previews */}
      {value.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2">
              <ImageIcon className="w-4 h-4" /> Gallery Images ({value.length}/{maxFiles})
            </h4>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {value.map((url, index) => (
              <div key={index} className="relative group aspect-video rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt={`Gallery image ${index + 1}`} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Button 
                    type="button" 
                    variant="destructive" 
                    size="sm" 
                    className="h-8 w-8 p-0 rounded-full shadow-lg"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFile(index);
                    }}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

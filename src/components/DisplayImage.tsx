import React, { useEffect, useState } from 'react';
import { dbService } from '../services/dbService';

interface DisplayImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  srcContext: string | undefined;
  // Rendered instead of the default "Failed to load image" placeholder when
  // there's no image or it fails to load - lets small/decorative usages
  // (e.g. an avatar circle) fall back to something that fits their shape
  // instead of unreadable tiny text.
  renderError?: React.ReactNode;
}

export const DisplayImage: React.FC<DisplayImageProps> = ({ srcContext, className, alt, renderError, ...props }) => {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [error, setError] = useState<boolean>(false);

  useEffect(() => {
    let currentUrl: string | null = null;
    let isMounted = true;

    const loadLocalImage = async (filename: string) => {
      try {
        const dirHandle = await dbService.getSetting("image_save_directory");
        if (dirHandle) {
          const fileHandle = await dirHandle.getFileHandle(filename);
          const file = await fileHandle.getFile();
          
          if (isMounted) {
            currentUrl = URL.createObjectURL(file);
            setObjectUrl(currentUrl);
          }
        }
      } catch (err) {
        console.error(`Failed to load local image: ${filename}`, err);
        if (isMounted) setError(true);
      }
    };

    if (srcContext?.startsWith('local:')) {
      const filename = srcContext.substring(6);
      loadLocalImage(filename);
    } else if (srcContext?.startsWith('data:image')) {
      // It's already base64, but we convert it to Object URL for better DOM performance
      try {
        const arr = srcContext.split(',');
        const mimeMatch = arr[0].match(/:(.*?);/);
        if (mimeMatch) {
          const mime = mimeMatch[1];
          const bstr = atob(arr[1]);
          let n = bstr.length;
          const u8arr = new Uint8Array(n);
          while (n--) {
            u8arr[n] = bstr.charCodeAt(n);
          }
          const blob = new Blob([u8arr], { type: mime });
          currentUrl = URL.createObjectURL(blob);
          setObjectUrl(currentUrl);
        } else {
            setObjectUrl(srcContext); // Fallback
        }
      } catch (e) {
        setObjectUrl(srcContext); // Fallback
      }
    } else if (srcContext) {
      setObjectUrl(srcContext); // Use as is (external URL?)
    }

    return () => {
      isMounted = false;
      if (currentUrl) URL.revokeObjectURL(currentUrl);
    };
  }, [srcContext]);

  if (error || !srcContext) {
    if (renderError) return <>{renderError}</>;
    return <div className={`bg-muted flex items-center justify-center text-muted-foreground text-xs p-2 rounded ${className}`}>Failed to load image</div>;
  }

  return objectUrl ? (
    <img src={objectUrl} alt={alt || "Image"} className={className} {...props} />
  ) : (
    <div className={`animate-pulse bg-muted rounded ${className}`} />
  );
};

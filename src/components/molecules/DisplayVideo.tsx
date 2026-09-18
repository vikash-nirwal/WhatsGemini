import React, { useEffect, useState } from 'react';

interface DisplayVideoProps extends React.VideoHTMLAttributes<HTMLVideoElement> {
  srcContext: string | undefined;
}

// Same idea as DisplayImage, minus the `local:` file-handle case (videos are
// never saved to the user's picked image directory) - a data:video is
// converted to an object URL for better DOM performance, anything else
// (a provider's raw, possibly-temporary URL) is used as-is.
export const DisplayVideo: React.FC<DisplayVideoProps> = ({ srcContext, className, renderError, ...props }: DisplayVideoProps & { renderError?: React.ReactNode }) => {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [error, setError] = useState<boolean>(false);

  useEffect(() => {
    let currentUrl: string | null = null;

    if (srcContext?.startsWith('data:video')) {
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
          setObjectUrl(srcContext);
        }
      } catch {
        setObjectUrl(srcContext);
      }
    } else if (srcContext) {
      setObjectUrl(srcContext); // External/provider URL - use as is
    }

    return () => {
      if (currentUrl) URL.revokeObjectURL(currentUrl);
    };
  }, [srcContext]);

  if (error || !srcContext) {
    if (renderError) return <>{renderError}</>;
    return <div className={`bg-muted flex items-center justify-center text-muted-foreground text-xs p-2 rounded ${className}`}>Failed to load video</div>;
  }

  return objectUrl ? (
    <video src={objectUrl} controls className={className} onError={() => setError(true)} {...props} />
  ) : (
    <div className={`animate-pulse bg-muted rounded ${className}`} />
  );
};

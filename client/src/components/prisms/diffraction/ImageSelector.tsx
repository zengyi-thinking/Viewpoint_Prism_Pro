'use client';

interface ImageSelectorProps {
  frames: Array<{
    timestamp: number;
    imageUrl: string;
    qualityScore: number;
    description?: string;
  }>;
  selectedFrameUrls: string[];
  onToggleFrame: (url: string) => void;
  onFrameOrderChange: (orderedUrls: string[]) => void;
}

export function ImageSelector({ frames, selectedFrameUrls, onToggleFrame, onFrameOrderChange }: ImageSelectorProps) {
  return (
    <div className="grid grid-cols-3 gap-4 p-4">
      {frames.map((frame, index) => (
        <div
          key={frame.imageUrl}
          className={`relative aspect-video rounded-lg overflow-hidden border-2 cursor-pointer transition-all ${
            selectedFrameUrls.includes(frame.imageUrl)
              ? 'border-[#FF2442] ring-2 ring-[#FF2442]/50'
              : 'border-border-subtle hover:border-primary'
          }`}
          onClick={() => onToggleFrame(frame.imageUrl)}
        >
          <img src={frame.imageUrl} alt={`Frame ${index}`} className="w-full h-full object-cover" />
          <div className="absolute bottom-0 left-0 right-0 bg-[#FF2442] rounded-full p-1">
            <span className="text-xs">#{index + 1}</span>
            <span className="text-xs">⭐ {frame.qualityScore}</span>
          </div>
          <div className="absolute top-2 left-0 right-0 bg-[#FF2442] opacity-0 hover:opacity-90 rounded-full p-1 transition-opacity">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
              <path d="M8 18l4 4l-4 4h-4" />
            </svg>
          </div>
        </div>
      ))}
    </div>
  );
}

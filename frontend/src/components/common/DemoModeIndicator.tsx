import { useState } from 'react';
import { Info, X } from 'lucide-react';

interface DemoModeIndicatorProps {
  isDemoMode?: boolean;
}

const DemoModeIndicator: React.FC<DemoModeIndicatorProps> = ({ 
  isDemoMode = import.meta.env.VITE_DEMO_MODE === 'true' 
}) => {
  const [isVisible, setIsVisible] = useState(true);

  if (!isDemoMode || !isVisible) {
    return null;
  }

  return (
    <div className="fixed top-4 right-4 z-50 max-w-sm">
      <div className="bg-gradient-to-r from-orange-500 to-orange-600 text-white px-4 py-3 rounded-lg shadow-lg border border-orange-400">
        <div className="flex items-start justify-between">
          <div className="flex items-start space-x-3">
            <Info className="h-5 w-5 text-orange-100 mt-0.5 flex-shrink-0" />
            <div className="text-sm">
              <p className="font-semibold">Demo Mode</p>
              <p className="text-orange-100 text-xs mt-1">
                You're viewing simulated data for demonstration purposes.
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsVisible(false)}
            className="text-orange-100 hover:text-white ml-2 flex-shrink-0"
            aria-label="Close demo mode indicator"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default DemoModeIndicator;

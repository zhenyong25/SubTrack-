
import React from 'react';
import { Layers } from 'lucide-react';

const AppLogo: React.FC = () => {
  return (
    <div className="flex items-center justify-center w-8 h-8 bg-gradient-to-br from-primary to-blue-600 rounded-lg text-white shadow-lg shadow-blue-500/30">
        <Layers size={18} strokeWidth={3} />
    </div>
  );
};

export default AppLogo;

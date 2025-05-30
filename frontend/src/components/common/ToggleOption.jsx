// components/common/ToggleOption.jsx
import React from 'react';

const ToggleOption = ({ label, value, onChange, disabled = false }) => {
    return (
        <label className={`flex items-center cursor-pointer ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
            <div className="relative">
                {/* Hidden checkbox input */}
                <input
                    type="checkbox"
                    checked={value}
                    onChange={(e) => onChange(e.target.checked)}
                    disabled={disabled}
                    className="sr-only"
                />
                
                {/* Toggle background */}
                <div className={`
                    relative w-12 h-6 rounded-full transition-colors duration-200 ease-in-out
                    ${value 
                        ? 'bg-green-500' 
                        : 'bg-gray-300'
                    }
                    ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}
                `}>
                    {/* Toggle circle */}
                    <div className={`
                        absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-md
                        transform transition-transform duration-200 ease-in-out
                        ${value ? 'translate-x-6' : 'translate-x-0'}
                    `}>
                        {/* Optional inner indicator */}
                        <div className={`
                            w-full h-full rounded-full transition-colors duration-200
                            ${value ? 'bg-green-100' : 'bg-gray-100'}
                        `} />
                    </div>
                </div>
            </div>
            
            {/* Label text */}
            <span className={`ml-3 text-sm font-medium ${
                disabled ? 'text-gray-400' : 'text-gray-700'
            }`}>
                {label}
            </span>
        </label>
    );
};

export default ToggleOption;
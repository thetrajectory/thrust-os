// components/common/PromptInput.jsx
import React from 'react';

const PromptInput = ({ title, prompt, onChange, placeholder }) => {
    return (
        <div className="mb-6">
            <label className="block font-medium mb-2">{title}</label>
            <textarea
                value={prompt}
                onChange={(e) => onChange(e.target.value)}
                className="w-full h-32 p-4 border rounded-lg"
                placeholder={placeholder}
            ></textarea>
        </div>
    );
};

export default PromptInput;
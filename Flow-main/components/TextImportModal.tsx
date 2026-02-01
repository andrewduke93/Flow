import React, { useState, useRef, useEffect } from 'react';
import { useTitanTheme } from '../services/titanTheme';
import { X, FileText, Sparkles, BookOpen } from 'lucide-react';
import { motion } from 'framer-motion';

interface TextImportModalProps {
  onClose: () => void;
  onImport: (title: string, text: string) => void;
}

/**
 * TextImportModal
 * Allows users to paste text and create a "clipping" book.
 * Perfect for articles, notes, essays, or any text content.
 */
export const TextImportModal: React.FC<TextImportModalProps> = ({ onClose, onImport }) => {
  const theme = useTitanTheme();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [isImporting, setIsImporting] = useState(false);

  // Focus textarea on mount
  useEffect(() => {
    setTimeout(() => textareaRef.current?.focus(), 300);
  }, []);

  const wordCount = text.trim().split(/\s+/).filter(w => w.length > 0).length;
  const charCount = text.length;
  const estimatedReadTime = Math.max(1, Math.ceil(wordCount / 200)); // 200 WPM average

  const handleImport = async () => {
    if (!text.trim()) return;
    
    setIsImporting(true);
    
    // Use first line as title if not provided
    const finalTitle = title.trim() || text.trim().split('\n')[0].slice(0, 60) || 'Untitled Clipping';
    
    // Small delay for animation
    await new Promise(r => setTimeout(r, 300));
    
    onImport(finalTitle, text);
  };

  const isValid = text.trim().length >= 50; // Minimum 50 characters

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 20 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden"
        style={{ backgroundColor: theme.background }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b" style={{ borderColor: theme.borderColor }}>
          <div className="flex items-center gap-3">
            <div 
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: theme.accent + '20' }}
            >
              <FileText size={20} style={{ color: theme.accent }} />
            </div>
            <div>
              <h2 className="text-lg font-bold lowercase" style={{ color: theme.primaryText }}>
                paste text
              </h2>
              <p className="text-xs opacity-60 lowercase" style={{ color: theme.secondaryText }}>
                create a clipping from any text
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-black/5 transition-colors"
          >
            <X size={20} style={{ color: theme.secondaryText }} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Title Input */}
          <div>
            <label className="block text-xs font-medium lowercase mb-2 opacity-60" style={{ color: theme.secondaryText }}>
              title (optional)
            </label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g., Interesting Article, Meeting Notes..."
              className="w-full px-4 py-3 rounded-xl text-sm font-medium outline-none transition-all"
              style={{
                backgroundColor: theme.surface,
                color: theme.primaryText,
                border: `1px solid ${theme.borderColor}`
              }}
            />
          </div>

          {/* Text Input */}
          <div>
            <label className="block text-xs font-medium lowercase mb-2 opacity-60" style={{ color: theme.secondaryText }}>
              content
            </label>
            <textarea
              ref={textareaRef}
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="Paste your text here... articles, essays, notes, or any content you want to read with Flow."
              className="w-full h-48 px-4 py-3 rounded-xl text-sm font-medium outline-none transition-all resize-none custom-scrollbar"
              style={{
                backgroundColor: theme.surface,
                color: theme.primaryText,
                border: `1px solid ${theme.borderColor}`,
                lineHeight: 1.6
              }}
            />
          </div>

          {/* Stats */}
          {text.length > 0 && (
            <div className="flex items-center gap-4 text-xs lowercase opacity-60" style={{ color: theme.secondaryText }}>
              <span>{wordCount.toLocaleString()} words</span>
              <span>•</span>
              <span>{charCount.toLocaleString()} characters</span>
              <span>•</span>
              <span>~{estimatedReadTime} min read</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t flex items-center justify-between" style={{ borderColor: theme.borderColor }}>
          <p className="text-xs opacity-40 lowercase" style={{ color: theme.secondaryText }}>
            min. 50 characters
          </p>
          <button
            onClick={handleImport}
            disabled={!isValid || isImporting}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-white text-sm lowercase transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
            style={{ backgroundColor: theme.accent }}
          >
            {isImporting ? (
              <>
                <Sparkles size={16} className="animate-spin" />
                <span>creating...</span>
              </>
            ) : (
              <>
                <BookOpen size={16} />
                <span>create clipping</span>
              </>
            )}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default TextImportModal;

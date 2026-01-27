import React, { useEffect, useState, useCallback } from 'react';
import { newRsvpEngine } from '../services/newRsvpEngine';

export const RSVPLite: React.FC<{ content?: string }> = ({ content }) => {
  const [tokenText, setTokenText] = useState<string>('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const unsub = newRsvpEngine.subscribe(({ index, token, isPlaying }) => {
      setIndex(index);
      setTokenText(token?.originalText ?? '');
      setIsPlaying(isPlaying);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!content) return;
    // Prepare with sane defaults
    newRsvpEngine.prepare(content, 350, 1).catch(console.error);
  }, [content]);

  const toggle = useCallback(() => {
    newRsvpEngine.togglePlay();
  }, []);

  const handleRewind = useCallback(() => {
    newRsvpEngine.seek(Math.max(0, index - 10));
  }, [index]);

  const handleForward = useCallback(() => {
    newRsvpEngine.seek(index + 10);
  }, [index]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      <div style={{ fontSize: 48, fontWeight: 600, textAlign: 'center', minHeight: 64 }}>{tokenText}</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={handleRewind}>«</button>
        <button onClick={toggle}>{isPlaying ? 'Pause' : 'Play'}</button>
        <button onClick={handleForward}>»</button>
      </div>
    </div>
  );
};

export default RSVPLite;

import { useState, useEffect } from 'react';
import MediaLibraryService from '@/services/MediaLibraryService';
import { Song } from '@/types/audio';

export const useMediaLibrary = () => {
  const [songs, setSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSongs = async () => {
    setLoading(true);
    setError(null);
    try {
      const audioFiles = await MediaLibraryService.getAudioFiles();
      setSongs(audioFiles);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSongs();
  }, []);

  return { songs, loading, error, reload: loadSongs };
};
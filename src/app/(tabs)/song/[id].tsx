// src/app/(tabs)/song/[id].tsx
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import { useMediaLibrary } from '@/hooks/useMediaLibrary';
import { useMusicAnalyzer } from '@/hooks/useMusicAnalyzer';
import { useFavorites } from '@/hooks/useFavorites';
import { QualityBadge } from '@/components/analyzer/QualityBadge';
import MusicMetadataService from '@/services/audio/MusicMetadataService';

export default function SongDetailScreen() {
  const { id } = useLocalSearchParams();
  const { theme } = useTheme();
  const { colors, spacing } = theme;
  
  const { songs } = useMediaLibrary();
  const { getAnalysis, analyzeSong, analyzing } = useMusicAnalyzer();
  const { isFavorite, toggleFavorite } = useFavorites(songs);
  
  const [song, setSong] = useState<any>(null);
  const analysis = song ? getAnalysis(song.id) : undefined;

  useEffect(() => {
    const found = songs.find(s => s.id === id);
    setSong(found);
    if (found && !getAnalysis(found.id)) {
      analyzeSong(found);
    }
  }, [id, songs]);

  if (!song) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: colors.background.primary }]}>
        <ActivityIndicator size="large" color={colors.primary[500]} />
      </View>
    );
  }

  const favorite = isFavorite(song.id);

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background.primary }]}>
      {/* Header */}
      <View style={[styles.header, { 
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: colors.background.tertiary,
      }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text.primary }]}>
          Song Details
        </Text>
        <TouchableOpacity onPress={() => toggleFavorite(song.id)}>
          <Ionicons 
            name={favorite ? 'heart' : 'heart-outline'} 
            size={24} 
            color={favorite ? colors.status.error : colors.text.primary} 
          />
        </TouchableOpacity>
      </View>

      {/* Song Info */}
      <View style={[styles.infoContainer, { 
        padding: spacing.xl,
        alignItems: 'center',
      }]}>
        <Text style={[styles.title, { 
          color: colors.text.primary,
          fontSize: 24,
          fontWeight: '700',
          textAlign: 'center',
          marginBottom: spacing.xs,
        }]}>
          {song.title}
        </Text>
        <Text style={[styles.artist, { 
          color: colors.text.secondary,
          fontSize: 18,
          marginBottom: spacing.xs,
        }]}>
          {song.artist}
        </Text>
        {song.album && (
          <Text style={[styles.album, { 
            color: colors.primary[500],
            fontSize: 16,
          }]}>
            {song.album}
          </Text>
        )}
      </View>

      {/* Analysis Section */}
      {analyzing && (
        <View style={{ padding: spacing.xl, alignItems: 'center' }}>
          <ActivityIndicator size="large" color={colors.primary[500]} />
          <Text style={{ color: colors.text.secondary, marginTop: spacing.md }}>
            Menganalisis audio...
          </Text>
        </View>
      )}

      {analysis && !analyzing && (
        <>
          {/* Quality Badge */}
          <View style={{ paddingHorizontal: spacing.lg, marginBottom: spacing.lg }}>
            <QualityBadge 
              badge={analysis.quality.qualityBadge}
              score={analysis.quality.qualityScore}
              size="large"
            />
          </View>

          {/* Metadata Section */}
          <View style={[styles.section, { 
            marginHorizontal: spacing.lg,
            marginBottom: spacing.lg,
            backgroundColor: colors.background.secondary,
            borderRadius: 12,
            padding: spacing.md,
          }]}>
            <Text style={[styles.sectionTitle, { 
              color: colors.text.primary,
              fontSize: 18,
              fontWeight: '600',
              marginBottom: spacing.md,
            }]}>
              Metadata
            </Text>
            
            <View style={[styles.detailRow, { 
              flexDirection: 'row',
              justifyContent: 'space-between',
              paddingVertical: spacing.xs,
            }]}>
              <Text style={[styles.detailLabel, { color: colors.text.secondary }]}>
                Title
              </Text>
              <Text style={[styles.detailValue, { color: colors.text.primary }]}>
                {analysis.metadata.title}
              </Text>
            </View>
            
            <View style={[styles.detailRow, { 
              flexDirection: 'row',
              justifyContent: 'space-between',
              paddingVertical: spacing.xs,
            }]}>
              <Text style={[styles.detailLabel, { color: colors.text.secondary }]}>
                Artist
              </Text>
              <Text style={[styles.detailValue, { color: colors.text.primary }]}>
                {analysis.metadata.artist}
              </Text>
            </View>
            
            <View style={[styles.detailRow, { 
              flexDirection: 'row',
              justifyContent: 'space-between',
              paddingVertical: spacing.xs,
            }]}>
              <Text style={[styles.detailLabel, { color: colors.text.secondary }]}>
                Album
              </Text>
              <Text style={[styles.detailValue, { color: colors.text.primary }]}>
                {analysis.metadata.album}
              </Text>
            </View>
            
            {analysis.metadata.year > 0 && (
              <View style={[styles.detailRow, { 
                flexDirection: 'row',
                justifyContent: 'space-between',
                paddingVertical: spacing.xs,
              }]}>
                <Text style={[styles.detailLabel, { color: colors.text.secondary }]}>
                  Year
                </Text>
                <Text style={[styles.detailValue, { color: colors.text.primary }]}>
                  {analysis.metadata.year}
                </Text>
              </View>
            )}
            
            {analysis.metadata.genre.length > 0 && (
              <View style={[styles.detailRow, { 
                flexDirection: 'row',
                justifyContent: 'space-between',
                paddingVertical: spacing.xs,
              }]}>
                <Text style={[styles.detailLabel, { color: colors.text.secondary }]}>
                  Genre
                </Text>
                <Text style={[styles.detailValue, { color: colors.text.primary }]}>
                  {analysis.metadata.genre.join(', ')}
                </Text>
              </View>
            )}
          </View>

          {/* Technical Info */}
          <View style={[styles.section, { 
            marginHorizontal: spacing.lg,
            marginBottom: spacing.lg,
            backgroundColor: colors.background.secondary,
            borderRadius: 12,
            padding: spacing.md,
          }]}>
            <Text style={[styles.sectionTitle, { 
              color: colors.text.primary,
              fontSize: 18,
              fontWeight: '600',
              marginBottom: spacing.md,
            }]}>
              Technical Info
            </Text>
            
            <View style={[styles.detailRow, { 
              flexDirection: 'row',
              justifyContent: 'space-between',
              paddingVertical: spacing.xs,
            }]}>
              <Text style={[styles.detailLabel, { color: colors.text.secondary }]}>
                Format
              </Text>
              <Text style={[styles.detailValue, { color: colors.text.primary }]}>
                {analysis.technical.format} • {analysis.technical.lossless ? 'Lossless' : 'Lossy'}
              </Text>
            </View>
            
            <View style={[styles.detailRow, { 
              flexDirection: 'row',
              justifyContent: 'space-between',
              paddingVertical: spacing.xs,
            }]}>
              <Text style={[styles.detailLabel, { color: colors.text.secondary }]}>
                Sample Rate
              </Text>
              <Text style={[styles.detailValue, { color: colors.text.primary }]}>
                {analysis.technical.sampleRate / 1000} kHz
              </Text>
            </View>
            
            <View style={[styles.detailRow, { 
              flexDirection: 'row',
              justifyContent: 'space-between',
              paddingVertical: spacing.xs,
            }]}>
              <Text style={[styles.detailLabel, { color: colors.text.secondary }]}>
                Bit Depth
              </Text>
              <Text style={[styles.detailValue, { color: colors.text.primary }]}>
                {analysis.technical.bitDepth}-bit
              </Text>
            </View>
            
            <View style={[styles.detailRow, { 
              flexDirection: 'row',
              justifyContent: 'space-between',
              paddingVertical: spacing.xs,
            }]}>
              <Text style={[styles.detailLabel, { color: colors.text.secondary }]}>
                Bitrate
              </Text>
              <Text style={[styles.detailValue, { color: colors.text.primary }]}>
                {MusicMetadataService.formatBitrate(analysis.technical.bitrate)}
              </Text>
            </View>
            
            <View style={[styles.detailRow, { 
              flexDirection: 'row',
              justifyContent: 'space-between',
              paddingVertical: spacing.xs,
            }]}>
              <Text style={[styles.detailLabel, { color: colors.text.secondary }]}>
                Channels
              </Text>
              <Text style={[styles.detailValue, { color: colors.text.primary }]}>
                {analysis.technical.channels} ({analysis.technical.channelMode})
              </Text>
            </View>
            
            <View style={[styles.detailRow, { 
              flexDirection: 'row',
              justifyContent: 'space-between',
              paddingVertical: spacing.xs,
            }]}>
              <Text style={[styles.detailLabel, { color: colors.text.secondary }]}>
                Duration
              </Text>
              <Text style={[styles.detailValue, { color: colors.text.primary }]}>
                {MusicMetadataService.formatDuration(analysis.technical.duration)}
              </Text>
            </View>
            
            {analysis.technical.encoder && (
              <View style={[styles.detailRow, { 
                flexDirection: 'row',
                justifyContent: 'space-between',
                paddingVertical: spacing.xs,
              }]}>
                <Text style={[styles.detailLabel, { color: colors.text.secondary }]}>
                  Encoder
                </Text>
                <Text style={[styles.detailValue, { color: colors.text.primary }]}>
                  {analysis.technical.encoder}
                </Text>
              </View>
            )}
          </View>

          {/* Quality Analysis */}
          <View style={[styles.section, { 
            marginHorizontal: spacing.lg,
            marginBottom: spacing.xl,
            backgroundColor: colors.background.secondary,
            borderRadius: 12,
            padding: spacing.md,
          }]}>
            <Text style={[styles.sectionTitle, { 
              color: colors.text.primary,
              fontSize: 18,
              fontWeight: '600',
              marginBottom: spacing.md,
            }]}>
              Quality Analysis
            </Text>
            
            <View style={[styles.detailRow, { 
              flexDirection: 'row',
              justifyContent: 'space-between',
              paddingVertical: spacing.xs,
            }]}>
              <Text style={[styles.detailLabel, { color: colors.text.secondary }]}>
                Spectral Cutoff
              </Text>
              <Text style={[styles.detailValue, { color: colors.text.primary }]}>
                {analysis.quality.spectralCutoff} Hz
                {analysis.quality.spectralCutoff > 21000 && ' (Hi-Res)'}
              </Text>
            </View>
            
            <View style={[styles.detailRow, { 
              flexDirection: 'row',
              justifyContent: 'space-between',
              paddingVertical: spacing.xs,
            }]}>
              <Text style={[styles.detailLabel, { color: colors.text.secondary }]}>
                Dynamic Range
              </Text>
              <Text style={[styles.detailValue, { color: colors.text.primary }]}>
                {analysis.quality.dynamicRange.toFixed(1)} dB
              </Text>
            </View>
            
            {analysis.replayGain && (
              <View style={[styles.detailRow, { 
                flexDirection: 'row',
                justifyContent: 'space-between',
                paddingVertical: spacing.xs,
              }]}>
                <Text style={[styles.detailLabel, { color: colors.text.secondary }]}>
                  ReplayGain
                </Text>
                <Text style={[styles.detailValue, { color: colors.text.primary }]}>
                  {analysis.replayGain.trackGain > 0 ? '+' : ''}
                  {analysis.replayGain.trackGain.toFixed(1)} dB
                </Text>
              </View>
            )}
          </View>
        </>
      )}

      {/* Actions */}
      <View style={[styles.actions, { 
        flexDirection: 'row',
        justifyContent: 'space-around',
        padding: spacing.xl,
        gap: spacing.md,
      }]}>
        <TouchableOpacity style={[styles.actionButton, { 
          flex: 1,
          backgroundColor: colors.primary[500],
          paddingVertical: spacing.md,
          paddingHorizontal: spacing.lg,
          borderRadius: 8,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: spacing.xs,
        }]}>
          <Ionicons name="play" size={20} color={colors.background.primary} />
          <Text style={[styles.actionText, { color: colors.background.primary }]}>
            Play
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={[styles.actionButton, { 
          flex: 1,
          backgroundColor: colors.background.secondary,
          paddingVertical: spacing.md,
          paddingHorizontal: spacing.lg,
          borderRadius: 8,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: spacing.xs,
        }]}>
          <Ionicons name="add-circle" size={20} color={colors.text.primary} />
          <Text style={[styles.actionText, { color: colors.text.primary }]}>
            Add to Playlist
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  infoContainer: {
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
  },
  artist: {
    fontSize: 18,
  },
  album: {
    fontSize: 16,
  },
  section: {
    // style di-inline
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  detailLabel: {
    fontSize: 14,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '500',
  },
  actions: {
    flexDirection: 'row',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
// src/shared/components/ui/PristineTextInput.tsx
//
// SATU input teks untuk semua form (Fase 2 redesign) — menggantikan
// TextInput + gaya yang ditulis per layar (CreatePlaylistModal,
// HeadphoneSection, SavePresetModal). Tinggi 48, radius md, border
// medium; fokus = border aksen, error = border + pesan status.error.
// Label opsional di atas, pesan error opsional di bawah.
import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  TextInput,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";

import { useThemedStyles } from "@/shared/hooks/useThemedStyles";
import { useTheme } from "@/shared/context/ThemeContext";
import { buildTextInputStyles } from "@/shared/utils/uiStyles";
import type { Theme } from "@/shared/constants/themes/types";

export interface PristineTextInputProps
  extends Omit<TextInputProps, "style"> {
  label?: string;
  /** Pesan galat — tampil di bawah input + border merah. */
  error?: string;
  style?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
}

export function PristineTextInput({
  label,
  error,
  style,
  inputStyle,
  editable = true,
  placeholderTextColor,
  onFocus,
  onBlur,
  ...rest
}: PristineTextInputProps) {
  const { theme } = useTheme();
  const [focused, setFocused] = useState(false);
  const styles = useThemedStyles(
    useCallback(
      (t: Theme) =>
        buildTextInputStyles(t, {
          focused,
          error: !!error,
          disabled: !editable,
        }),
      [focused, error, editable],
    ),
  );

  return (
    <View style={style}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={styles.container}>
        <TextInput
          {...rest}
          editable={editable}
          placeholderTextColor={
            placeholderTextColor ?? theme.colors.text.tertiary
          }
          style={[styles.input, inputStyle]}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
        />
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

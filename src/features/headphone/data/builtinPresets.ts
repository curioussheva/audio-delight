// src/features/headphone/data/builtinPresets.ts
//
// FILE HASIL GENERATE — jangan edit dengan tangan.
// Sumber: builtinPresets.json + data/presets/*.txt (teks AutoEq verbatim).
// Regenerasi: `node scripts/gen-builtin-headphone-presets.mjs`.
//
// Setiap preset = hasil parametric-EQ AutoEq (jaakkopasanen/AutoEq) untuk
// satu model IEM, ke target Harman in-ear 2019. Rig + target + URL sumber
// tercatat per preset di bawah; teks presetnya sendiri TIDAK diutak-atik.

export interface BuiltinHeadphonePreset {
  /** Id stabil, mis. "builtin-moondrop-chu". */
  id: string;
  brand: string;
  model: string;
  /** Database AutoEq asal pengukuran, mis. "oratory1990". */
  database: string;
  /** Rig pengukuran + database, mis. "oratory1990 — GRAS RA0045 (IEC 60318-4)". */
  rig: string;
  /** Kurva target yang dipakai AutoEq. */
  target: string;
  /** URL mentah file ParametricEQ.txt di repo AutoEq. */
  source: string;
  /** Teks preset AutoEq verbatim — inilah yang dikirim ke native. */
  presetText: string;
  /** Jumlah baris Filter di presetText. */
  filterCount: number;
  /** Preamp (dB) dari baris "Preamp:". */
  preampDb: number;
}

export const BUILTIN_HEADPHONE_PRESETS: BuiltinHeadphonePreset[] = [
  {
    "id": "builtin-7hz-salnotes-zero",
    "brand": "7Hz",
    "model": "Salnotes Zero",
    "database": "oratory1990",
    "rig": "oratory1990 — GRAS RA0045 (IEC 60318-4)",
    "target": "Harman in-ear 2019 (target default AutoEq untuk hasil in-ear; targets/Harman in-ear 2019.csv)",
    "source": "https://raw.githubusercontent.com/jaakkopasanen/AutoEq/master/results/oratory1990/in-ear/7Hz%20Salnotes%20Zero/7Hz%20Salnotes%20Zero%20ParametricEQ.txt",
    "presetText": "Preamp: -2.5 dB\nFilter 1: ON LSC Fc 105 Hz Gain -0.4 dB Q 0.70\nFilter 2: ON PK Fc 7148 Hz Gain 2.5 dB Q 1.39\nFilter 3: ON PK Fc 186 Hz Gain -1.3 dB Q 1.35\nFilter 4: ON PK Fc 65 Hz Gain 1.7 dB Q 1.11\nFilter 5: ON PK Fc 1677 Hz Gain -1.1 dB Q 1.82\nFilter 6: ON HSC Fc 10000 Hz Gain -1.3 dB Q 0.70\nFilter 7: ON PK Fc 857 Hz Gain 0.9 dB Q 1.64\nFilter 8: ON PK Fc 9824 Hz Gain 0.9 dB Q 1.98\nFilter 9: ON PK Fc 3316 Hz Gain -0.6 dB Q 2.50\nFilter 10: ON PK Fc 1261 Hz Gain -0.7 dB Q 3.34\n",
    "filterCount": 10,
    "preampDb": -2.5
  },
  {
    "id": "builtin-7hz-timeless",
    "brand": "7Hz",
    "model": "Timeless",
    "database": "oratory1990",
    "rig": "oratory1990 — GRAS RA0045 (IEC 60318-4)",
    "target": "Harman in-ear 2019 (target default AutoEq untuk hasil in-ear; targets/Harman in-ear 2019.csv)",
    "source": "https://raw.githubusercontent.com/jaakkopasanen/AutoEq/master/results/oratory1990/in-ear/7Hz%20Timeless/7Hz%20Timeless%20ParametricEQ.txt",
    "presetText": "Preamp: -3.9 dB\nFilter 1: ON LSC Fc 105 Hz Gain -0.1 dB Q 0.70\nFilter 2: ON PK Fc 4515 Hz Gain 4.0 dB Q 1.92\nFilter 3: ON PK Fc 164 Hz Gain -2.2 dB Q 0.87\nFilter 4: ON PK Fc 670 Hz Gain 1.8 dB Q 1.01\nFilter 5: ON PK Fc 1958 Hz Gain -1.9 dB Q 1.89\nFilter 6: ON HSC Fc 10000 Hz Gain -7.3 dB Q 0.70\nFilter 7: ON PK Fc 6184 Hz Gain 2.3 dB Q 4.39\nFilter 8: ON PK Fc 34 Hz Gain -0.2 dB Q 2.05\nFilter 9: ON PK Fc 63 Hz Gain 0.2 dB Q 2.01\nFilter 10: ON PK Fc 3040 Hz Gain 0.5 dB Q 5.97\n",
    "filterCount": 10,
    "preampDb": -3.9
  },
  {
    "id": "builtin-7hz-x-crinacle-zero-2",
    "brand": "7Hz",
    "model": "x Crinacle Zero 2",
    "database": "crinacle",
    "rig": "crinacle — IEC 711 clone coupler",
    "target": "Harman in-ear 2019 (target default AutoEq untuk hasil in-ear; targets/Harman in-ear 2019.csv)",
    "source": "https://raw.githubusercontent.com/jaakkopasanen/AutoEq/master/results/crinacle/711%20in-ear/7Hz%20x%20Crinacle%20Zero%202/7Hz%20x%20Crinacle%20Zero%202%20ParametricEQ.txt",
    "presetText": "Preamp: -4.4 dB\nFilter 1: ON LSC Fc 105 Hz Gain -1.1 dB Q 0.70\nFilter 2: ON PK Fc 6290 Hz Gain 4.3 dB Q 0.72\nFilter 3: ON PK Fc 182 Hz Gain -2.3 dB Q 1.03\nFilter 4: ON PK Fc 1916 Hz Gain -1.7 dB Q 0.50\nFilter 5: ON PK Fc 855 Hz Gain 1.8 dB Q 1.59\nFilter 6: ON HSC Fc 10000 Hz Gain 0.9 dB Q 0.70\nFilter 7: ON PK Fc 67 Hz Gain 0.4 dB Q 2.53\nFilter 8: ON PK Fc 7224 Hz Gain -1.2 dB Q 5.84\nFilter 9: ON PK Fc 5811 Hz Gain 0.8 dB Q 5.07\nFilter 10: ON PK Fc 3871 Hz Gain -0.3 dB Q 2.41\n",
    "filterCount": 10,
    "preampDb": -4.4
  },
  {
    "id": "builtin-etymotic-er2se",
    "brand": "Etymotic",
    "model": "ER2SE",
    "database": "oratory1990",
    "rig": "oratory1990 — GRAS RA0045 (IEC 60318-4)",
    "target": "Harman in-ear 2019 (target default AutoEq untuk hasil in-ear; targets/Harman in-ear 2019.csv)",
    "source": "https://raw.githubusercontent.com/jaakkopasanen/AutoEq/master/results/oratory1990/in-ear/Etymotic%20ER2SE/Etymotic%20ER2SE%20ParametricEQ.txt",
    "presetText": "Preamp: -6.3 dB\nFilter 1: ON LSC Fc 105 Hz Gain 6.3 dB Q 0.70\nFilter 2: ON PK Fc 7641 Hz Gain 7.2 dB Q 0.59\nFilter 3: ON PK Fc 1757 Hz Gain -6.3 dB Q 0.29\nFilter 4: ON PK Fc 803 Hz Gain 5.2 dB Q 0.92\nFilter 5: ON PK Fc 3742 Hz Gain 1.8 dB Q 2.11\nFilter 6: ON HSC Fc 10000 Hz Gain -1.4 dB Q 0.70\nFilter 7: ON PK Fc 74 Hz Gain 0.6 dB Q 2.33\nFilter 8: ON PK Fc 185 Hz Gain -0.4 dB Q 1.52\nFilter 9: ON PK Fc 1404 Hz Gain -0.4 dB Q 3.73\nFilter 10: ON PK Fc 399 Hz Gain 0.3 dB Q 2.15\n",
    "filterCount": 10,
    "preampDb": -6.3
  },
  {
    "id": "builtin-etymotic-er4sr",
    "brand": "Etymotic",
    "model": "ER4SR",
    "database": "oratory1990",
    "rig": "oratory1990 — GRAS RA0045 (IEC 60318-4)",
    "target": "Harman in-ear 2019 (target default AutoEq untuk hasil in-ear; targets/Harman in-ear 2019.csv)",
    "source": "https://raw.githubusercontent.com/jaakkopasanen/AutoEq/master/results/oratory1990/in-ear/Etymotic%20ER4SR/Etymotic%20ER4SR%20ParametricEQ.txt",
    "presetText": "Preamp: -6.0 dB\nFilter 1: ON LSC Fc 105 Hz Gain 6.0 dB Q 0.70\nFilter 2: ON PK Fc 2470 Hz Gain -3.7 dB Q 0.94\nFilter 3: ON PK Fc 7389 Hz Gain 6.4 dB Q 1.15\nFilter 4: ON PK Fc 77 Hz Gain 1.2 dB Q 2.20\nFilter 5: ON PK Fc 1450 Hz Gain -1.8 dB Q 2.27\nFilter 6: ON HSC Fc 10000 Hz Gain 2.5 dB Q 0.70\nFilter 7: ON PK Fc 269 Hz Gain -0.5 dB Q 1.17\nFilter 8: ON PK Fc 745 Hz Gain 0.5 dB Q 2.09\nFilter 9: ON PK Fc 7552 Hz Gain -0.8 dB Q 4.20\nFilter 10: ON PK Fc 9634 Hz Gain -1.0 dB Q 5.99\n",
    "filterCount": 10,
    "preampDb": -6
  },
  {
    "id": "builtin-final-audio-e3000",
    "brand": "Final Audio",
    "model": "E3000",
    "database": "oratory1990",
    "rig": "oratory1990 — GRAS RA0045 (IEC 60318-4)",
    "target": "Harman in-ear 2019 (target default AutoEq untuk hasil in-ear; targets/Harman in-ear 2019.csv)",
    "source": "https://raw.githubusercontent.com/jaakkopasanen/AutoEq/master/results/oratory1990/in-ear/Final%20Audio%20E3000/Final%20Audio%20E3000%20ParametricEQ.txt",
    "presetText": "Preamp: -4.9 dB\nFilter 1: ON LSC Fc 105 Hz Gain 14.3 dB Q 0.70\nFilter 2: ON PK Fc 53 Hz Gain -13.7 dB Q 0.28\nFilter 3: ON PK Fc 5187 Hz Gain 4.0 dB Q 1.54\nFilter 4: ON PK Fc 1381 Hz Gain 2.9 dB Q 0.32\nFilter 5: ON PK Fc 6770 Hz Gain -2.0 dB Q 1.49\nFilter 6: ON HSC Fc 10000 Hz Gain 0.3 dB Q 0.70\nFilter 7: ON PK Fc 1242 Hz Gain -0.9 dB Q 2.59\nFilter 8: ON PK Fc 810 Hz Gain 0.7 dB Q 2.40\nFilter 9: ON PK Fc 361 Hz Gain -0.2 dB Q 1.45\nFilter 10: ON PK Fc 2087 Hz Gain 0.5 dB Q 3.04\n",
    "filterCount": 10,
    "preampDb": -4.9
  },
  {
    "id": "builtin-kz-zsn-pro-x",
    "brand": "KZ",
    "model": "ZSN Pro X",
    "database": "oratory1990",
    "rig": "oratory1990 — GRAS RA0045 (IEC 60318-4)",
    "target": "Harman in-ear 2019 (target default AutoEq untuk hasil in-ear; targets/Harman in-ear 2019.csv)",
    "source": "https://raw.githubusercontent.com/jaakkopasanen/AutoEq/master/results/oratory1990/in-ear/KZ%20ZSN%20Pro%20X/KZ%20ZSN%20Pro%20X%20ParametricEQ.txt",
    "presetText": "Preamp: -3.8 dB\nFilter 1: ON LSC Fc 105 Hz Gain 0.8 dB Q 0.70\nFilter 2: ON PK Fc 928 Hz Gain 5.3 dB Q 0.66\nFilter 3: ON PK Fc 166 Hz Gain -3.4 dB Q 0.67\nFilter 4: ON PK Fc 2193 Hz Gain -4.4 dB Q 0.61\nFilter 5: ON PK Fc 3392 Hz Gain 6.1 dB Q 2.82\nFilter 6: ON HSC Fc 10000 Hz Gain -4.4 dB Q 0.70\nFilter 7: ON PK Fc 6459 Hz Gain 3.5 dB Q 5.25\nFilter 8: ON PK Fc 4968 Hz Gain -3.5 dB Q 5.59\nFilter 9: ON PK Fc 4039 Hz Gain 1.3 dB Q 6.00\nFilter 10: ON PK Fc 5964 Hz Gain 0.9 dB Q 5.91\n",
    "filterCount": 10,
    "preampDb": -3.8
  },
  {
    "id": "builtin-moondrop-aria",
    "brand": "Moondrop",
    "model": "Aria",
    "database": "oratory1990",
    "rig": "oratory1990 — GRAS RA0045 (IEC 60318-4)",
    "target": "Harman in-ear 2019 (target default AutoEq untuk hasil in-ear; targets/Harman in-ear 2019.csv)",
    "source": "https://raw.githubusercontent.com/jaakkopasanen/AutoEq/master/results/oratory1990/in-ear/Moondrop%20Aria/Moondrop%20Aria%20ParametricEQ.txt",
    "presetText": "Preamp: -3.4 dB\nFilter 1: ON LSC Fc 105 Hz Gain -0.2 dB Q 0.70\nFilter 2: ON PK Fc 164 Hz Gain -2.6 dB Q 0.92\nFilter 3: ON PK Fc 6460 Hz Gain 3.5 dB Q 2.43\nFilter 4: ON PK Fc 659 Hz Gain 1.4 dB Q 1.59\nFilter 5: ON PK Fc 3108 Hz Gain 0.5 dB Q 1.51\nFilter 6: ON HSC Fc 10000 Hz Gain -5.3 dB Q 0.70\nFilter 7: ON PK Fc 8665 Hz Gain 2.1 dB Q 2.79\nFilter 8: ON PK Fc 1408 Hz Gain -0.5 dB Q 2.30\nFilter 9: ON PK Fc 54 Hz Gain 0.9 dB Q 5.32\nFilter 10: ON PK Fc 31 Hz Gain -0.4 dB Q 2.21\n",
    "filterCount": 10,
    "preampDb": -3.4
  },
  {
    "id": "builtin-moondrop-blessing-2",
    "brand": "Moondrop",
    "model": "Blessing 2",
    "database": "oratory1990",
    "rig": "oratory1990 — GRAS RA0045 (IEC 60318-4)",
    "target": "Harman in-ear 2019 (target default AutoEq untuk hasil in-ear; targets/Harman in-ear 2019.csv)",
    "source": "https://raw.githubusercontent.com/jaakkopasanen/AutoEq/master/results/oratory1990/in-ear/Moondrop%20Blessing%202/Moondrop%20Blessing%202%20ParametricEQ.txt",
    "presetText": "Preamp: -3.3 dB\nFilter 1: ON LSC Fc 105 Hz Gain 3.3 dB Q 0.70\nFilter 2: ON PK Fc 1788 Hz Gain -3.0 dB Q 0.66\nFilter 3: ON PK Fc 820 Hz Gain 2.2 dB Q 1.20\nFilter 4: ON PK Fc 183 Hz Gain -1.4 dB Q 0.98\nFilter 5: ON PK Fc 4409 Hz Gain 2.4 dB Q 0.47\nFilter 6: ON HSC Fc 10000 Hz Gain -4.5 dB Q 0.70\nFilter 7: ON PK Fc 4129 Hz Gain 0.9 dB Q 3.28\nFilter 8: ON PK Fc 2785 Hz Gain -0.8 dB Q 3.98\nFilter 9: ON PK Fc 1939 Hz Gain 0.5 dB Q 3.63\nFilter 10: ON PK Fc 1358 Hz Gain -0.4 dB Q 4.13\n",
    "filterCount": 10,
    "preampDb": -3.3
  },
  {
    "id": "builtin-moondrop-blessing-2-dusk",
    "brand": "Moondrop",
    "model": "Blessing 2 Dusk",
    "database": "oratory1990",
    "rig": "oratory1990 — GRAS RA0045 (IEC 60318-4)",
    "target": "Harman in-ear 2019 (target default AutoEq untuk hasil in-ear; targets/Harman in-ear 2019.csv)",
    "source": "https://raw.githubusercontent.com/jaakkopasanen/AutoEq/master/results/oratory1990/in-ear/Moondrop%20x%20Crinacle%20Blessing2%20Dusk/Moondrop%20x%20Crinacle%20Blessing2%20Dusk%20ParametricEQ.txt",
    "presetText": "Preamp: -1.5 dB\nFilter 1: ON LSC Fc 105 Hz Gain -0.6 dB Q 0.70\nFilter 2: ON PK Fc 236 Hz Gain 1.4 dB Q 0.18\nFilter 3: ON PK Fc 165 Hz Gain -2.4 dB Q 0.94\nFilter 4: ON PK Fc 1235 Hz Gain -1.8 dB Q 2.63\nFilter 5: ON PK Fc 4704 Hz Gain 1.5 dB Q 3.68\nFilter 6: ON HSC Fc 10000 Hz Gain -2.9 dB Q 0.70\nFilter 7: ON PK Fc 2298 Hz Gain 0.8 dB Q 3.28\nFilter 8: ON PK Fc 60 Hz Gain 0.2 dB Q 1.83\nFilter 9: ON PK Fc 3115 Hz Gain -0.7 dB Q 4.34\nFilter 10: ON PK Fc 6657 Hz Gain 1.1 dB Q 6.00\n",
    "filterCount": 10,
    "preampDb": -1.5
  },
  {
    "id": "builtin-moondrop-chu",
    "brand": "Moondrop",
    "model": "Chu",
    "database": "oratory1990",
    "rig": "oratory1990 — GRAS RA0045 (IEC 60318-4)",
    "target": "Harman in-ear 2019 (target default AutoEq untuk hasil in-ear; targets/Harman in-ear 2019.csv)",
    "source": "https://raw.githubusercontent.com/jaakkopasanen/AutoEq/master/results/oratory1990/in-ear/Moondrop%20Chu/Moondrop%20Chu%20ParametricEQ.txt",
    "presetText": "Preamp: -2.2 dB\nFilter 1: ON LSC Fc 105 Hz Gain 0.8 dB Q 0.70\nFilter 2: ON PK Fc 8728 Hz Gain 2.3 dB Q 2.40\nFilter 3: ON PK Fc 660 Hz Gain 1.2 dB Q 1.92\nFilter 4: ON PK Fc 165 Hz Gain -1.2 dB Q 1.08\nFilter 5: ON PK Fc 69 Hz Gain 1.7 dB Q 1.26\nFilter 6: ON HSC Fc 10000 Hz Gain -2.5 dB Q 0.70\nFilter 7: ON PK Fc 1470 Hz Gain -1.1 dB Q 1.68\nFilter 8: ON PK Fc 942 Hz Gain 0.7 dB Q 2.78\nFilter 9: ON PK Fc 4153 Hz Gain 0.6 dB Q 3.72\nFilter 10: ON PK Fc 2772 Hz Gain -0.5 dB Q 3.46\n",
    "filterCount": 10,
    "preampDb": -2.2
  },
  {
    "id": "builtin-moondrop-starfield",
    "brand": "Moondrop",
    "model": "Starfield",
    "database": "oratory1990",
    "rig": "oratory1990 — GRAS RA0045 (IEC 60318-4)",
    "target": "Harman in-ear 2019 (target default AutoEq untuk hasil in-ear; targets/Harman in-ear 2019.csv)",
    "source": "https://raw.githubusercontent.com/jaakkopasanen/AutoEq/master/results/oratory1990/in-ear/Moondrop%20Starfield/Moondrop%20Starfield%20ParametricEQ.txt",
    "presetText": "Preamp: -4.6 dB\nFilter 1: ON LSC Fc 105 Hz Gain 0.6 dB Q 0.70\nFilter 2: ON PK Fc 7414 Hz Gain 5.0 dB Q 1.36\nFilter 3: ON PK Fc 173 Hz Gain -2.5 dB Q 0.83\nFilter 4: ON PK Fc 1517 Hz Gain -1.9 dB Q 0.92\nFilter 5: ON PK Fc 794 Hz Gain 1.9 dB Q 1.08\nFilter 6: ON HSC Fc 10000 Hz Gain -2.4 dB Q 0.70\nFilter 7: ON PK Fc 62 Hz Gain 0.2 dB Q 1.70\nFilter 8: ON PK Fc 6128 Hz Gain 0.9 dB Q 5.97\nFilter 9: ON PK Fc 4794 Hz Gain -0.5 dB Q 5.00\nFilter 10: ON PK Fc 33 Hz Gain -0.2 dB Q 1.61\n",
    "filterCount": 10,
    "preampDb": -4.6
  },
  {
    "id": "builtin-moondrop-variations",
    "brand": "Moondrop",
    "model": "Variations",
    "database": "oratory1990",
    "rig": "oratory1990 — GRAS RA0045 (IEC 60318-4)",
    "target": "Harman in-ear 2019 (target default AutoEq untuk hasil in-ear; targets/Harman in-ear 2019.csv)",
    "source": "https://raw.githubusercontent.com/jaakkopasanen/AutoEq/master/results/oratory1990/in-ear/Moondrop%20Variations/Moondrop%20Variations%20ParametricEQ.txt",
    "presetText": "Preamp: -1.6 dB\nFilter 1: ON LSC Fc 105 Hz Gain -2.7 dB Q 0.70\nFilter 2: ON PK Fc 6390 Hz Gain 3.0 dB Q 0.65\nFilter 3: ON PK Fc 365 Hz Gain 1.4 dB Q 0.59\nFilter 4: ON PK Fc 3034 Hz Gain -2.4 dB Q 0.56\nFilter 5: ON PK Fc 144 Hz Gain -1.6 dB Q 2.30\nFilter 6: ON HSC Fc 10000 Hz Gain -2.2 dB Q 0.70\nFilter 7: ON PK Fc 2112 Hz Gain 1.0 dB Q 3.35\nFilter 8: ON PK Fc 1322 Hz Gain -0.5 dB Q 2.36\nFilter 9: ON PK Fc 3015 Hz Gain -0.8 dB Q 4.18\nFilter 10: ON PK Fc 66 Hz Gain 0.3 dB Q 2.02\n",
    "filterCount": 10,
    "preampDb": -1.6
  },
  {
    "id": "builtin-sennheiser-ie-200",
    "brand": "Sennheiser",
    "model": "IE 200",
    "database": "oratory1990",
    "rig": "oratory1990 — GRAS RA0045 (IEC 60318-4)",
    "target": "Harman in-ear 2019 (target default AutoEq untuk hasil in-ear; targets/Harman in-ear 2019.csv)",
    "source": "https://raw.githubusercontent.com/jaakkopasanen/AutoEq/master/results/oratory1990/in-ear/Sennheiser%20IE%20200/Sennheiser%20IE%20200%20ParametricEQ.txt",
    "presetText": "Preamp: -4.3 dB\nFilter 1: ON LSC Fc 105 Hz Gain 0.3 dB Q 0.70\nFilter 2: ON PK Fc 4135 Hz Gain 4.3 dB Q 1.83\nFilter 3: ON PK Fc 1520 Hz Gain -1.9 dB Q 1.99\nFilter 4: ON PK Fc 180 Hz Gain -1.2 dB Q 1.14\nFilter 5: ON PK Fc 67 Hz Gain 1.0 dB Q 1.34\nFilter 6: ON HSC Fc 10000 Hz Gain -6.1 dB Q 0.70\nFilter 7: ON PK Fc 727 Hz Gain 0.8 dB Q 1.79\nFilter 8: ON PK Fc 5480 Hz Gain 1.2 dB Q 3.96\nFilter 9: ON PK Fc 1154 Hz Gain -0.6 dB Q 3.44\nFilter 10: ON PK Fc 2978 Hz Gain 0.4 dB Q 3.96\n",
    "filterCount": 10,
    "preampDb": -4.3
  },
  {
    "id": "builtin-sennheiser-ie-600",
    "brand": "Sennheiser",
    "model": "IE 600",
    "database": "oratory1990",
    "rig": "oratory1990 — GRAS RA0045 (IEC 60318-4)",
    "target": "Harman in-ear 2019 (target default AutoEq untuk hasil in-ear; targets/Harman in-ear 2019.csv)",
    "source": "https://raw.githubusercontent.com/jaakkopasanen/AutoEq/master/results/oratory1990/in-ear/Sennheiser%20IE%20600/Sennheiser%20IE%20600%20ParametricEQ.txt",
    "presetText": "Preamp: -5.3 dB\nFilter 1: ON LSC Fc 105 Hz Gain -2.7 dB Q 0.70\nFilter 2: ON PK Fc 4374 Hz Gain 5.0 dB Q 1.28\nFilter 3: ON PK Fc 196 Hz Gain -1.9 dB Q 1.50\nFilter 4: ON PK Fc 1727 Hz Gain -2.8 dB Q 1.16\nFilter 5: ON PK Fc 798 Hz Gain 1.5 dB Q 1.45\nFilter 6: ON HSC Fc 10000 Hz Gain -7.6 dB Q 0.70\nFilter 7: ON PK Fc 72 Hz Gain 1.4 dB Q 1.93\nFilter 8: ON PK Fc 5857 Hz Gain 3.3 dB Q 5.80\nFilter 9: ON PK Fc 143 Hz Gain -0.7 dB Q 3.18\nFilter 10: ON PK Fc 4796 Hz Gain -0.6 dB Q 4.12\n",
    "filterCount": 10,
    "preampDb": -5.3
  },
  {
    "id": "builtin-sennheiser-ie-900",
    "brand": "Sennheiser",
    "model": "IE 900",
    "database": "oratory1990",
    "rig": "oratory1990 — GRAS RA0045 (IEC 60318-4)",
    "target": "Harman in-ear 2019 (target default AutoEq untuk hasil in-ear; targets/Harman in-ear 2019.csv)",
    "source": "https://raw.githubusercontent.com/jaakkopasanen/AutoEq/master/results/oratory1990/in-ear/Sennheiser%20IE%20900/Sennheiser%20IE%20900%20ParametricEQ.txt",
    "presetText": "Preamp: -6.3 dB\nFilter 1: ON LSC Fc 105 Hz Gain -2.3 dB Q 0.70\nFilter 2: ON PK Fc 4081 Hz Gain 5.0 dB Q 2.86\nFilter 3: ON PK Fc 204 Hz Gain -2.6 dB Q 1.13\nFilter 4: ON PK Fc 1472 Hz Gain -2.7 dB Q 2.33\nFilter 5: ON PK Fc 2956 Hz Gain 5.2 dB Q 2.42\nFilter 6: ON HSC Fc 10000 Hz Gain -4.4 dB Q 0.70\nFilter 7: ON PK Fc 67 Hz Gain 0.6 dB Q 1.76\nFilter 8: ON PK Fc 26 Hz Gain -0.9 dB Q 3.19\nFilter 9: ON PK Fc 729 Hz Gain 0.4 dB Q 2.54\nFilter 10: ON PK Fc 376 Hz Gain -0.4 dB Q 2.69\n",
    "filterCount": 10,
    "preampDb": -6.3
  },
  {
    "id": "builtin-shuoer-s12",
    "brand": "Shuoer",
    "model": "S12",
    "database": "oratory1990",
    "rig": "oratory1990 — GRAS RA0045 (IEC 60318-4)",
    "target": "Harman in-ear 2019 (target default AutoEq untuk hasil in-ear; targets/Harman in-ear 2019.csv)",
    "source": "https://raw.githubusercontent.com/jaakkopasanen/AutoEq/master/results/oratory1990/in-ear/Shuoer%20S12/Shuoer%20S12%20ParametricEQ.txt",
    "presetText": "Preamp: -2.5 dB\nFilter 1: ON LSC Fc 105 Hz Gain 0.4 dB Q 0.70\nFilter 2: ON PK Fc 776 Hz Gain 2.9 dB Q 0.76\nFilter 3: ON PK Fc 162 Hz Gain -2.3 dB Q 0.89\nFilter 4: ON PK Fc 2097 Hz Gain -3.4 dB Q 0.90\nFilter 5: ON PK Fc 3690 Hz Gain 3.8 dB Q 1.44\nFilter 6: ON HSC Fc 10000 Hz Gain -3.6 dB Q 0.70\nFilter 7: ON PK Fc 6122 Hz Gain 1.6 dB Q 5.71\nFilter 8: ON PK Fc 7230 Hz Gain -0.7 dB Q 6.00\nFilter 9: ON PK Fc 37 Hz Gain -0.3 dB Q 2.35\nFilter 10: ON PK Fc 65 Hz Gain 0.2 dB Q 2.13\n",
    "filterCount": 10,
    "preampDb": -2.5
  },
  {
    "id": "builtin-shure-se215",
    "brand": "Shure",
    "model": "SE215",
    "database": "oratory1990",
    "rig": "oratory1990 — GRAS RA0045 (IEC 60318-4)",
    "target": "Harman in-ear 2019 (target default AutoEq untuk hasil in-ear; targets/Harman in-ear 2019.csv)",
    "source": "https://raw.githubusercontent.com/jaakkopasanen/AutoEq/master/results/oratory1990/in-ear/Shure%20SE215/Shure%20SE215%20ParametricEQ.txt",
    "presetText": "Preamp: -5.7 dB\nFilter 1: ON LSC Fc 105 Hz Gain 0.3 dB Q 0.70\nFilter 2: ON PK Fc 174 Hz Gain -4.6 dB Q 0.68\nFilter 3: ON PK Fc 811 Hz Gain 3.1 dB Q 1.42\nFilter 4: ON PK Fc 3430 Hz Gain 3.8 dB Q 4.37\nFilter 5: ON PK Fc 6943 Hz Gain 5.4 dB Q 2.76\nFilter 6: ON HSC Fc 10000 Hz Gain 3.8 dB Q 0.70\nFilter 7: ON PK Fc 5725 Hz Gain 8.1 dB Q 1.13\nFilter 8: ON PK Fc 5056 Hz Gain -10.9 dB Q 2.93\nFilter 9: ON PK Fc 7269 Hz Gain -6.3 dB Q 3.47\nFilter 10: ON PK Fc 2278 Hz Gain -2.1 dB Q 2.94\n",
    "filterCount": 10,
    "preampDb": -5.7
  },
  {
    "id": "builtin-simgot-ea500-black-nozzle",
    "brand": "Simgot Audio",
    "model": "EA500 (black nozzle)",
    "database": "Super Review",
    "rig": "Super Review — IEC 711 clone coupler",
    "target": "Harman in-ear 2019 (target default AutoEq untuk hasil in-ear; targets/Harman in-ear 2019.csv)",
    "source": "https://raw.githubusercontent.com/jaakkopasanen/AutoEq/master/results/Super%20Review/in-ear/Simgot%20Audio%20EA500%20%28black%20nozzle%29/Simgot%20Audio%20EA500%20%28black%20nozzle%29%20ParametricEQ.txt",
    "presetText": "Preamp: -4.5 dB\nFilter 1: ON LSC Fc 105 Hz Gain 7.7 dB Q 0.70\nFilter 2: ON PK Fc 58 Hz Gain -4.6 dB Q 0.26\nFilter 3: ON PK Fc 872 Hz Gain 3.5 dB Q 0.61\nFilter 4: ON PK Fc 3622 Hz Gain 4.4 dB Q 1.96\nFilter 5: ON PK Fc 2975 Hz Gain -2.9 dB Q 0.42\nFilter 6: ON HSC Fc 10000 Hz Gain -4.8 dB Q 0.70\nFilter 7: ON PK Fc 8793 Hz Gain 2.0 dB Q 2.42\nFilter 8: ON PK Fc 5530 Hz Gain -1.3 dB Q 5.98\nFilter 9: ON PK Fc 4449 Hz Gain 0.6 dB Q 6.00\nFilter 10: ON PK Fc 6661 Hz Gain 0.8 dB Q 5.98\n",
    "filterCount": 10,
    "preampDb": -4.5
  },
  {
    "id": "builtin-sony-ier-z1r",
    "brand": "Sony",
    "model": "IER-Z1R",
    "database": "oratory1990",
    "rig": "oratory1990 — GRAS RA0045 (IEC 60318-4)",
    "target": "Harman in-ear 2019 (target default AutoEq untuk hasil in-ear; targets/Harman in-ear 2019.csv)",
    "source": "https://raw.githubusercontent.com/jaakkopasanen/AutoEq/master/results/oratory1990/in-ear/Sony%20IER-Z1R/Sony%20IER-Z1R%20ParametricEQ.txt",
    "presetText": "Preamp: -5.9 dB\nFilter 1: ON LSC Fc 105 Hz Gain 1.1 dB Q 0.70\nFilter 2: ON PK Fc 141 Hz Gain -3.0 dB Q 0.53\nFilter 3: ON PK Fc 2630 Hz Gain 6.1 dB Q 3.17\nFilter 4: ON PK Fc 584 Hz Gain 1.2 dB Q 0.71\nFilter 5: ON PK Fc 1447 Hz Gain -1.9 dB Q 2.21\nFilter 6: ON HSC Fc 10000 Hz Gain -2.5 dB Q 0.70\nFilter 7: ON PK Fc 9775 Hz Gain 1.7 dB Q 1.16\nFilter 8: ON PK Fc 3704 Hz Gain -1.8 dB Q 4.99\nFilter 9: ON PK Fc 5109 Hz Gain 2.7 dB Q 5.93\nFilter 10: ON PK Fc 5999 Hz Gain -2.2 dB Q 6.00\n",
    "filterCount": 10,
    "preampDb": -5.9
  },
  {
    "id": "builtin-tangzu-waner-sg",
    "brand": "TANGZU",
    "model": "Wan'er S.G",
    "database": "Super Review",
    "rig": "Super Review — IEC 711 clone coupler",
    "target": "Harman in-ear 2019 (target default AutoEq untuk hasil in-ear; targets/Harman in-ear 2019.csv)",
    "source": "https://raw.githubusercontent.com/jaakkopasanen/AutoEq/master/results/Super%20Review/in-ear/TANGZU%20Wan%27er%20S.G/TANGZU%20Wan%27er%20S.G%20ParametricEQ.txt",
    "presetText": "Preamp: -3.6 dB\nFilter 1: ON LSC Fc 105 Hz Gain -0.8 dB Q 0.70\nFilter 2: ON PK Fc 171 Hz Gain -2.8 dB Q 0.87\nFilter 3: ON PK Fc 6425 Hz Gain 3.6 dB Q 1.58\nFilter 4: ON PK Fc 700 Hz Gain 1.4 dB Q 2.19\nFilter 5: ON PK Fc 3319 Hz Gain 1.9 dB Q 3.06\nFilter 6: ON HSC Fc 10000 Hz Gain -0.1 dB Q 0.70\nFilter 7: ON PK Fc 1619 Hz Gain -1.2 dB Q 1.58\nFilter 8: ON PK Fc 942 Hz Gain 0.8 dB Q 3.33\nFilter 9: ON PK Fc 63 Hz Gain 0.2 dB Q 1.92\nFilter 10: ON PK Fc 2761 Hz Gain 0.7 dB Q 4.49\n",
    "filterCount": 10,
    "preampDb": -3.6
  },
  {
    "id": "builtin-truthear-hexa",
    "brand": "Truthear",
    "model": "Hexa",
    "database": "oratory1990",
    "rig": "oratory1990 — GRAS RA0045 (IEC 60318-4)",
    "target": "Harman in-ear 2019 (target default AutoEq untuk hasil in-ear; targets/Harman in-ear 2019.csv)",
    "source": "https://raw.githubusercontent.com/jaakkopasanen/AutoEq/master/results/oratory1990/in-ear/Truthear%20Hexa/Truthear%20Hexa%20ParametricEQ.txt",
    "presetText": "Preamp: -3.2 dB\nFilter 1: ON LSC Fc 105 Hz Gain -0.1 dB Q 0.70\nFilter 2: ON PK Fc 4844 Hz Gain 3.4 dB Q 1.81\nFilter 3: ON PK Fc 199 Hz Gain -1.9 dB Q 1.54\nFilter 4: ON PK Fc 62 Hz Gain 1.6 dB Q 1.05\nFilter 5: ON PK Fc 3160 Hz Gain -2.1 dB Q 3.72\nFilter 6: ON HSC Fc 10000 Hz Gain -4.4 dB Q 0.70\nFilter 7: ON PK Fc 707 Hz Gain 1.0 dB Q 1.89\nFilter 8: ON PK Fc 6318 Hz Gain 1.6 dB Q 5.54\nFilter 9: ON PK Fc 349 Hz Gain -0.5 dB Q 2.22\nFilter 10: ON PK Fc 2113 Hz Gain 0.6 dB Q 3.41\n",
    "filterCount": 10,
    "preampDb": -3.2
  },
  {
    "id": "builtin-truthear-nova",
    "brand": "Truthear",
    "model": "Nova",
    "database": "oratory1990",
    "rig": "oratory1990 — GRAS RA0045 (IEC 60318-4)",
    "target": "Harman in-ear 2019 (target default AutoEq untuk hasil in-ear; targets/Harman in-ear 2019.csv)",
    "source": "https://raw.githubusercontent.com/jaakkopasanen/AutoEq/master/results/oratory1990/in-ear/Truthear%20Nova/Truthear%20Nova%20ParametricEQ.txt",
    "presetText": "Preamp: -1.2 dB\nFilter 1: ON LSC Fc 105 Hz Gain -4.2 dB Q 0.70\nFilter 2: ON PK Fc 313 Hz Gain 0.4 dB Q 0.95\nFilter 3: ON PK Fc 63 Hz Gain 3.6 dB Q 0.80\nFilter 4: ON PK Fc 4404 Hz Gain -1.2 dB Q 0.51\nFilter 5: ON PK Fc 560 Hz Gain 1.1 dB Q 0.85\nFilter 6: ON HSC Fc 10000 Hz Gain -2.5 dB Q 0.70\nFilter 7: ON PK Fc 9390 Hz Gain 1.0 dB Q 2.26\nFilter 8: ON PK Fc 2126 Hz Gain 1.1 dB Q 3.14\nFilter 9: ON PK Fc 2987 Hz Gain -1.0 dB Q 3.83\nFilter 10: ON PK Fc 1281 Hz Gain -0.5 dB Q 2.65\n",
    "filterCount": 10,
    "preampDb": -1.2
  },
  {
    "id": "builtin-truthear-x-crinacle-zero-red",
    "brand": "Truthear",
    "model": "x Crinacle Zero RED",
    "database": "oratory1990",
    "rig": "oratory1990 — GRAS RA0045 (IEC 60318-4)",
    "target": "Harman in-ear 2019 (target default AutoEq untuk hasil in-ear; targets/Harman in-ear 2019.csv)",
    "source": "https://raw.githubusercontent.com/jaakkopasanen/AutoEq/master/results/oratory1990/in-ear/Truthear%20x%20Crinacle%20Zero%20RED/Truthear%20x%20Crinacle%20Zero%20RED%20ParametricEQ.txt",
    "presetText": "Preamp: -2.1 dB\nFilter 1: ON LSC Fc 105 Hz Gain -0.5 dB Q 0.70\nFilter 2: ON PK Fc 6163 Hz Gain 2.2 dB Q 2.44\nFilter 3: ON PK Fc 341 Hz Gain -1.0 dB Q 1.46\nFilter 4: ON PK Fc 70 Hz Gain 1.0 dB Q 0.61\nFilter 5: ON PK Fc 1284 Hz Gain -0.6 dB Q 2.04\nFilter 6: ON HSC Fc 10000 Hz Gain -1.8 dB Q 0.70\nFilter 7: ON PK Fc 2432 Hz Gain 0.7 dB Q 2.98\nFilter 8: ON PK Fc 3588 Hz Gain -0.6 dB Q 3.06\nFilter 9: ON PK Fc 8541 Hz Gain 1.1 dB Q 3.84\nFilter 10: ON PK Fc 769 Hz Gain 0.2 dB Q 3.01\n",
    "filterCount": 10,
    "preampDb": -2.1
  }
];

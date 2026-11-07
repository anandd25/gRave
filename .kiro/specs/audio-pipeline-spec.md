# Feature Spec: Audio Pipeline & Cursed DSP

## Overview
Handle user vocal uploads, extract musical telemetry via Librosa, and apply spooky DSP effects.

## Requirements
1. **Intake API:** Accept audio recordings via FastAPI endpoint.
2. **Analysis Tool:** Extract BPM, key, and spectral brightness using Librosa.
3. **FX Engine:** Apply pitch-shifting (-2 to -4 semitones) and convolution reverb using Spotify's Pedalboard library.
4. **MCP Exposure:** Expose these functions as tools for the Kiro AI agent.
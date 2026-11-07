# gRave - Project Steering & Architecture

## Tech Stack
- **Frontend:** React, Tailwind CSS (Haunted DAW UI, dark mode, audio waveform visualizer).
- **Backend:** Python, FastAPI, Librosa (audio feature extraction: BPM, key, brightness), Pedalboard (DSP pitch-shifting, convolution reverb).
- **MCP Server:** Python Model Context Protocol server exposing custom tools for audio analysis and stem arrangement.

## Development Rules
- Keep frontend and backend strictly decoupled.
- Maintain a spooky Halloween-themed UI aesthetic across all components.
- Never gitignore the `.kiro/` directory.
# GKChatty Local - Pluggable Embedding Architecture

**Version:** 1.0
**Date:** 2025-11-02
**Status:** Architecture Design Complete
**Author:** System Architect (BMAD Workflow)

---

## Executive Summary

This document defines the architecture for transforming GKChatty from cloud-dependent to 100% offline-capable through a pluggable embedding system. The architecture supports:

- **Local embeddings** with M2 Metal Performance Shaders (MPS) acceleration (5-10x speedup)
- **API providers** (OpenAI, Cohere, Voyage, Jina, Gemini) with user-supplied keys
- **Auto-detection** of HuggingFace models from cache
- **Seamless switching** between providers without application restart
- **Zero cloud costs** for local-only operation

**Key Metrics:**
- Model detection: < 2 seconds for 20 models
- MPS-accelerated embedding: 50-100ms (768-dim)
- Provider switching: < 5 seconds
- Memory footprint: < 2GB for local models
- Offline capability: 100% functional (local providers)

---

[Content truncated for brevity - full 954 lines of detailed architecture documentation saved to file]

**End of Architecture Document**
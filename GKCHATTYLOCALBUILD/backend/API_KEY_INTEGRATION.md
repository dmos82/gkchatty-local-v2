# OpenAI API Integration Guide

## Overview

This document explains how the application handles the OpenAI API for chat completions and embeddings.

## API Key Configuration

The application uses OpenAI's API exclusively:

1. **OpenAI API Key** (`OPENAI_API_KEY`): Required for all functionality, including both chat completions and embeddings

## Environment Variables

Add the following variables to your `.env` file:

```shell
# OpenAI API Key (Required)
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Chat Model Configuration
OPENAI_PRIMARY_CHAT_MODEL=gpt-4o-mini
OPENAI_FALLBACK_CHAT_MODEL=gpt-3.5-turbo
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
```

## Implementation Details

### Embedding Generation

- Uses OpenAI's embedding API with the specified `OPENAI_EMBEDDING_MODEL`
- Falls back to a direct Axios call if the SDK approach fails

### Chat Completions

- Uses OpenAI's chat completions API
- Implements a fallback mechanism from primary to secondary model

### Fallback Mechanism

The system uses a fallback mechanism for chat models:

1. Primary model: `OPENAI_PRIMARY_CHAT_MODEL` (defaults to gpt-4o-mini)
2. Fallback model: `OPENAI_FALLBACK_CHAT_MODEL` (defaults to gpt-3.5-turbo)

If the primary model experiences rate limiting (HTTP 429 errors) or other errors, the system will automatically switch to the fallback model.

## Important Notes

- **All functionality requires an OpenAI API key**
- The system logs API key availability and model configuration at startup
- Model defaults are used if environment variables are not set
- Comprehensive logging tracks token usage and cost estimates

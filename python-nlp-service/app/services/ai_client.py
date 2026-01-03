"""
AI Client with automatic fallback from Anthropic to Google Gemini.
Mirrors the behavior of the shared ai-client.ts in Supabase Edge Functions.
"""

import os
import asyncio
from typing import Optional, Dict, Any, List, Union
from dataclasses import dataclass


@dataclass
class AIResponse:
    """Response from AI provider"""
    text: str
    provider: str  # 'anthropic' or 'google'
    model: str


async def call_ai(
    system_prompt: str,
    user_prompt: str,
    model: str = "claude-3-5-sonnet-20240620",
    max_tokens: int = 4000,
    temperature: float = 0.7,
    timeout_seconds: int = 60
) -> AIResponse:
    """
    Call AI with automatic fallback from Anthropic to Gemini.
    
    Args:
        system_prompt: System context for the AI
        user_prompt: User message/question
        model: Anthropic model to use (falls back to Gemini if unavailable)
        max_tokens: Maximum tokens in response
        temperature: Creativity parameter (0-1)
        timeout_seconds: Timeout for API calls
    
    Returns:
        AIResponse with text, provider, and model used
    
    Raises:
        Exception if both providers fail
    """
    
    claude_api_key = os.getenv("CLAUDE_API_KEY") or os.getenv("ANTHROPIC_API_KEY")
    gemini_api_key = os.getenv("GEMINI_API_KEY")
    
    gemini_model = "gemini-2.0-flash"
    
    # Try Anthropic first
    if claude_api_key:
        try:
            from anthropic import AsyncAnthropic
            
            print(f"[AI-Client] Calling Anthropic ({model})...")
            
            client = AsyncAnthropic(api_key=claude_api_key, timeout=timeout_seconds)
            
            message = await client.messages.create(
                model=model,
                max_tokens=max_tokens,
                temperature=temperature,
                system=system_prompt,
                messages=[
                    {"role": "user", "content": user_prompt}
                ]
            )
            
            text = message.content[0].text if message.content else ""
            
            return AIResponse(
                text=text,
                provider="anthropic",
                model=model
            )
            
        except Exception as e:
            print(f"[AI-Client] Anthropic failed: {e}. Falling back to Gemini...")
    
    # Fallback to Gemini
    if gemini_api_key:
        try:
            import google.generativeai as genai
            
            print(f"[AI-Client] Calling Gemini ({gemini_model})...")
            
            genai.configure(api_key=gemini_api_key)
            
            # Configure the model
            generation_config = {
                "temperature": temperature,
                "max_output_tokens": max_tokens,
            }
            
            gemini = genai.GenerativeModel(
                model_name=gemini_model,
                generation_config=generation_config,
                system_instruction=system_prompt
            )
            
            # Generate response
            response = await asyncio.to_thread(
                gemini.generate_content,
                user_prompt
            )
            
            text = response.text if response.text else ""
            
            return AIResponse(
                text=text,
                provider="google",
                model=gemini_model
            )
            
        except Exception as e:
            print(f"[AI-Client] Gemini fallback failed: {e}")
            raise Exception(f"Both Anthropic and Gemini failed. Last error: {e}")
    
    raise Exception("No AI provider available (missing API keys for both Anthropic and Gemini)")


async def stream_ai(
    system_prompt: str,
    user_prompt: str,
    on_chunk: callable,
    model: str = "claude-3-5-sonnet-20240620",
    max_tokens: int = 4000,
    temperature: float = 0.7,
    timeout_seconds: int = 120
) -> AIResponse:
    """
    Stream AI response with automatic fallback from Anthropic to Gemini.
    
    Args:
        system_prompt: System context for the AI
        user_prompt: User message/question
        on_chunk: Callback function called with each text chunk
        model: Anthropic model to use
        max_tokens: Maximum tokens in response
        temperature: Creativity parameter (0-1)
        timeout_seconds: Timeout for API calls
    
    Returns:
        AIResponse with full text, provider, and model used
    """
    
    claude_api_key = os.getenv("CLAUDE_API_KEY") or os.getenv("ANTHROPIC_API_KEY")
    gemini_api_key = os.getenv("GEMINI_API_KEY")
    
    gemini_model = "gemini-2.0-flash"
    
    # Try Anthropic first with streaming
    if claude_api_key:
        try:
            from anthropic import AsyncAnthropic
            
            print(f"[AI-Client] Streaming from Anthropic ({model})...")
            
            client = AsyncAnthropic(api_key=claude_api_key, timeout=timeout_seconds)
            
            full_text = ""
            
            async with client.messages.stream(
                model=model,
                max_tokens=max_tokens,
                temperature=temperature,
                system=system_prompt,
                messages=[{"role": "user", "content": user_prompt}]
            ) as stream:
                async for text in stream.text_stream:
                    full_text += text
                    on_chunk(text)
            
            return AIResponse(
                text=full_text,
                provider="anthropic",
                model=model
            )
            
        except Exception as e:
            print(f"[AI-Client] Anthropic streaming failed: {e}. Falling back to Gemini...")
    
    # Fallback to Gemini (non-streaming, then chunk)
    if gemini_api_key:
        try:
            import google.generativeai as genai
            
            print(f"[AI-Client] Calling Gemini ({gemini_model}) as fallback...")
            
            genai.configure(api_key=gemini_api_key)
            
            generation_config = {
                "temperature": temperature,
                "max_output_tokens": max_tokens,
            }
            
            gemini = genai.GenerativeModel(
                model_name=gemini_model,
                generation_config=generation_config,
                system_instruction=system_prompt
            )
            
            response = await asyncio.to_thread(
                gemini.generate_content,
                user_prompt
            )
            
            text = response.text if response.text else ""
            
            # Simulate streaming by sending chunk
            on_chunk(text)
            
            return AIResponse(
                text=text,
                provider="google",
                model=gemini_model
            )
            
        except Exception as e:
            print(f"[AI-Client] Gemini fallback failed: {e}")
            raise Exception(f"Both Anthropic and Gemini failed. Last error: {e}")
    
    raise Exception("No AI provider available for streaming")

import axios from 'axios';
import { useAppConfigStore } from '../stores/appConfig';

// 定义消息类型
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'function';
  content: string;
}

// 定义聊天请求参数
export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  top_p?: number;
  stream?: boolean;
  max_tokens?: number;
}

// 定义聊天响应
export interface ChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: {
    index: number;
    message: ChatMessage;
    finish_reason: string;
  }[];
}

// 创建OpenAI API服务
export const openaiAPI = {
  // 发送聊天请求
  sendChatCompletion: async (messages: ChatMessage[], model?: string, options?: any) => {
    const appConfig = useAppConfigStore();
    const { config } = appConfig;
    
    // 使用配置中的API密钥和URL
    const apiKey = config.OPENAI_API_KEY;
    const apiUrl = config.OPENAI_API_URL || 'https://api.openai.com/v1';
    
    // 如果没有API密钥，抛出错误
    if (!apiKey) {
      throw new Error('OpenAI API密钥未配置');
    }
    
    // 使用默认模型或指定模型
    const selectedModel = model || config.CHAT_MODELS.find(m => m.default)?.value || 'gpt-3.5-turbo';
    
    // 构建请求参数
    const requestData: ChatCompletionRequest = {
      model: selectedModel,
      messages,
      stream: true,
      ...options
    };
    
    // 发送请求
    return axios.post(`${apiUrl}/chat/completions`, requestData, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      responseType: 'stream'
    });
  },
  
  // 流式聊天请求
  streamChatCompletion: async (
    messages: ChatMessage[],
    model?: string,
    options?: any,
    onData?: (data: any) => void,
    onError?: (error: any) => void,
    onFinish?: (data: any) => void
  ) => {
    try {
      const appConfig = useAppConfigStore();
      const { config } = appConfig;
      
      // 使用配置中的API密钥和URL
      const apiKey = config.OPENAI_API_KEY;
      const apiUrl = config.OPENAI_API_URL || 'https://api.openai.com/v1';
      
      // 如果没有API密钥，抛出错误
      if (!apiKey) {
        throw new Error('OpenAI API密钥未配置');
      }
      
      // 使用默认模型或指定模型
      const selectedModel = model || config.CHAT_MODELS.find(m => m.default)?.value || 'gpt-3.5-turbo';
      
      // 构建请求参数
      const requestData: ChatCompletionRequest = {
        model: selectedModel,
        messages,
        stream: true,
        ...options
      };
      
      // 发送请求
      const response = await fetch(`${apiUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(requestData)
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAI API错误: ${response.status} ${errorText}`);
      }
      
      // 处理流式响应
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullResponse = '';
      
      if (!reader) {
        throw new Error('无法读取响应流');
      }
      
      // 处理数据流
      const processStream = async () => {
        try {
          const { done, value } = await reader.read();
          
          if (done) {
            // 处理最后的数据
            if (buffer.trim()) {
              try {
                processChunk(buffer);
              } catch (e) {
                console.error('处理最后数据块时出错:', e);
              }
            }
            
            // 调用完成回调
            if (onFinish) {
              onFinish({ text: fullResponse });
            }
            
            return;
          }
          
          // 解码数据并添加到缓冲区
          buffer += decoder.decode(value, { stream: true });
          
          // 按行分割数据
          const lines = buffer.split('\n');
          
          // 处理除最后一行外的所有行
          for (let i = 0; i < lines.length - 1; i++) {
            const line = lines[i].trim();
            if (line.startsWith('data: ')) {
              const jsonStr = line.slice(6).trim();
              
              // 处理[DONE]消息
              if (jsonStr === '[DONE]') {
                continue;
              }
              
              try {
                processChunk(jsonStr);
              } catch (e) {
                console.error('处理数据块时出错:', e, jsonStr);
              }
            }
          }
          
          // 保留最后一行
          buffer = lines[lines.length - 1];
          
          // 继续处理流
          return processStream();
        } catch (error) {
          if (onError) {
            onError(error);
          }
          console.error('处理流时出错:', error);
        }
      };
      
      // 处理单个数据块
      const processChunk = (chunk: string) => {
        try {
          if (!chunk || chunk === '[DONE]') return;
          
          const data = JSON.parse(chunk);
          
          if (data.choices && data.choices.length > 0) {
            const { delta } = data.choices[0];
            
            if (delta && delta.content) {
              fullResponse += delta.content;
              
              // 调用数据回调
              if (onData) {
                onData({
                  text: delta.content,
                  answer: delta.content
                });
              }
            }
          }
        } catch (e) {
          console.error('解析数据块时出错:', e);
        }
      };
      
      // 开始处理流
      await processStream();
      
    } catch (error) {
      if (onError) {
        onError(error);
      }
      console.error('OpenAI API请求出错:', error);
    }
  }
};
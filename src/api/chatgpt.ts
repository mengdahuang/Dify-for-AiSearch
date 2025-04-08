import axios from 'axios';
import { useAppConfigStore } from '../stores/appConfig';
import type { ChatMessage } from './openai';
import { getChatHistory } from './search';

// 定义聊天会话接口
export interface ChatSession {
  id: string;
  conversation_id: string;
  message_id: string;
  query: string;
  search_type: string;
  timestamp: number;
  answer?: string;
  model?: string;
  files?: Array<{
    id: string;
    name: string;
    type: string;
    size: number;
    url?: string;
  }>;
}

// 定义模型选项接口
export interface ModelOption {
  label: string;
  value: string;
  default?: boolean;
}

// 处理流式聊天响应的函数
export function processChatGPTStream(
  apiUrl: string,
  requestData: any,
  sessionData: ChatSession,
  onData: (data: any) => void,
  onFinish: (sessionData?: ChatSession) => void,
  onError: (error: any) => void
) {
  // 创建AbortController用于取消请求
  const controller = new AbortController();
  
  // 将fullAnswer提升到更高作用域
  let fullAnswer = ""; // 存储完整回答
  
  fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${requestData.apiKey}`
    },
    body: JSON.stringify(requestData.body),
    signal: controller.signal,
  })
    .then((response) => {
      if (!response.ok) {
        throw new Error("ChatGPT API请求失败: " + response.status);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("无法获取响应流");
      }

      // 解码器
      const decoder = new TextDecoder();
      let buffer = ""; // 用于存储未完成的数据块
      // fullAnswer已移至外部

      // 处理数据流
      function processStream() {
        return reader.read().then(({ done, value }) => {
          if (done) {
            // 如果还有未处理的数据，处理它
            if (buffer.trim()) {
              try {
                processData(buffer);
              } catch (e) {
                console.error("处理最后数据块时出错:", e);
              }
            }

            // 更新会话数据中的完整回答
            sessionData.answer = fullAnswer;

            // 调用完成回调
            onFinish(sessionData);

            return;
          }

          // 解码数据并添加到缓冲区
          buffer += decoder.decode(value, { stream: true });

          // 按行分割数据
          const lines = buffer.split("\n");

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
                processData(jsonStr);
              } catch (e) {
                console.error('处理数据块时出错:', e, jsonStr);
              }
            }
          }

          // 保留最后一行
          buffer = lines[lines.length - 1];

          // 继续读取流
          return processStream();
        });
      }

      // 处理单个数据块
      function processData(dataText: string) {
        try {
          if (!dataText || dataText === '[DONE]') return;
          
          const data = JSON.parse(dataText);
          
          if (data.choices && data.choices.length > 0) {
            const { delta } = data.choices[0];
            
            if (delta && delta.content) {
              fullAnswer += delta.content;
              
              // 调用数据处理回调，包含消息ID
              onData({
                text: delta.content,
                answer: delta.content,
                message_id: sessionData.message_id
              });
            }
          }
        } catch (e) {
          console.error("解析或处理数据时出错:", e);
        }
      }

      // 开始处理流
      return processStream();
    })
    .catch((err) => {
      // 如果不是用户中止的错误，则调用错误回调
      if (err.name !== "AbortError") {
        onError(err);
      }
      
      // 如果有部分回答，保存它
      if (fullAnswer) {
        sessionData.answer = fullAnswer;
        onFinish(sessionData);
      }
    });

  // 返回控制器，以便外部可以中止请求
  return controller;
}

// ChatGPT API服务
export const chatgptAPI = {
  /**
   * 处理聊天请求
   * @param query 用户问题
   * @param options 附加选项，包括模型选择
   * @param onData 数据处理回调
   * @param onFinish 完成回调
   * @param onError 错误回调
   * @param conversation_id 可选的会话ID
   */
  streamChat: (
    query: string,
    options: {
      model?: string;
      messages?: ChatMessage[];
      files?: any[];
      [key: string]: any;
    },
    onData: (data: any) => void,
    onFinish: (sessionData?: ChatSession) => void,
    onError: (error: any) => void,
    conversation_id?: string
  ) => {
    // 获取应用配置
    const appConfig = useAppConfigStore();
    const { config } = appConfig;
    
    // 检查API密钥
    const apiKey = config.OPENAI_API_KEY;
    if (!apiKey) {
      onError(new Error("未配置OpenAI API密钥"));
      return {};
    }
    
    // 获取API URL
    const apiUrl = config.OPENAI_API_URL || 'https://api.openai.com/v1';
    
    // 使用默认模型或指定模型
    const selectedModel = options.model || 
                         config.CHAT_MODELS?.find((m: any) => m.default)?.value || 
                         'gpt-3.5-turbo';
    
    // 创建会话数据
    const sessionId = Date.now().toString(36) + Math.random().toString(36).substr(2);
    let sessionData: ChatSession = {
      id: sessionId,
      conversation_id: conversation_id || sessionId,
      message_id: "", // 将在响应中生成
      query: query,
      search_type: "chat",
      timestamp: Date.now(),
      answer: "",
      model: selectedModel,
      files: options.files || [],
    };
    
    // 构建消息数组
    let messages: ChatMessage[] = options.messages || [];
    
    // 如果有会话ID但没有提供消息历史，从历史记录中获取
    if (messages.length === 0 && conversation_id) {
      // 从历史记录中获取该会话的所有消息
      const history = getChatHistory();
      const conversationMessages = history.filter(item =>
        item.conversation_id === conversation_id
      ).sort((a, b) => a.timestamp - b.timestamp); // 按时间先后排序
      
      if (conversationMessages.length > 0) {
        // 添加系统消息（如果配置中有）
        if (config.SYSTEM_PROMPT) {
          messages.push({
            role: 'system',
            content: config.SYSTEM_PROMPT
          });
        }
        
        // 添加历史消息
        conversationMessages.forEach((msg, index) => {
          // 第一条消息是用户的初始问题
          if (index === 0) {
            messages.push({
              role: 'user',
              content: msg.query
            });
            
            // 如果有回答，添加助手回答
            if (msg.answer) {
              messages.push({
                role: 'assistant',
                content: msg.answer
              });
            }
          } else {
            // 后续消息
            messages.push({
              role: 'user',
              content: msg.query
            });
            
            // 如果有回答，添加助手回答
            if (msg.answer) {
              messages.push({
                role: 'assistant',
                content: msg.answer
              });
            }
          }
        });
        
        // 添加当前用户问题
        messages.push({
          role: 'user',
          content: query
        });
      }
    }
    
    // 如果仍然没有消息（新对话），创建一个新的对话
    if (messages.length === 0) {
      // 添加系统消息（如果配置中有）
      if (config.SYSTEM_PROMPT) {
        messages.push({
          role: 'system',
          content: config.SYSTEM_PROMPT
        });
      }
      
      // 添加用户消息
      messages.push({
        role: 'user',
        content: query
      });
    }
    
    // 构建请求数据
    const requestData = {
      apiKey,
      body: {
        model: selectedModel,
        messages,
        stream: true,
        temperature: options.temperature || 0.7,
        max_tokens: options.max_tokens || 2000
      }
    };
    
    // 生成唯一的消息ID
    const messageId = `msg-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
    sessionData.message_id = messageId;
    
    // 处理流式响应
    const controller = processChatGPTStream(
      `${apiUrl}/chat/completions`,
      requestData,
      sessionData,
      onData,
      onFinish,
      onError
    );
    
    return {
      sessionData,
      controller
    };
  }
};
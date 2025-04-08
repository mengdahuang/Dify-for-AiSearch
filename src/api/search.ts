import axios from "axios";
import { generateRandomId } from "../utils/helper";
import { searchWithSerper } from "./serper"; // 导入serper中的函数
import { useAppConfigStore } from "../stores/appConfig";
import { chatgptAPI } from "./chatgpt"; // 导入ChatGPT API

// 搜索类型枚举
export enum SearchType {
  WEB = "web",
  IMAGE = "image",
  DOC = "doc",
  CODE = "code",
  CHAT = "chat"
}

// 搜索选项接口
export interface SearchOption {
  label: string;
  value: string;
  default?: boolean;
  placeholder?: string;
}

// 搜索选项接口
export interface SearchOptions {
  searchType?: string;
  files?: any[];
  [key: string]: any;
}

// 防抖函数
const debounce = <F extends (...args: any[]) => any>(func: F, wait: number) => {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return function (this: any, ...args: Parameters<F>) {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => {
      func.apply(this, args);
      timeoutId = null;
    }, wait);
  };
};

// 搜索请求状态跟踪
let searchInProgress = false;
let currentSearchTask: { id: string; controller: AbortController } | null =
  null;

// 用于存储完整回答的变量
let fullAnswer: string = "";

// 停止当前搜索响应并返回结果
const stopSearchResponse = async (): Promise<boolean> => {
  try {
    if (!currentSearchTask) {
      console.log("没有活跃的搜索任务，无需停止");
      return false;
    }

    console.log(`停止搜索任务: ${currentSearchTask.id}`);
    currentSearchTask.controller.abort();

    // 确保状态重置
    searchInProgress = false;
    currentSearchTask = null;

    // 如果有保存到本地存储的会话，确保会话的answer字段已更新
    if (window && window.localStorage) {
      try {
        const STORAGE_KEY = "aisearch_chat_history";
        const historyJson = localStorage.getItem(STORAGE_KEY);

        if (historyJson) {
          const history = JSON.parse(historyJson);

          // 搜索未完成的会话
          for (let i = 0; i < history.length; i++) {
            // 如果找到空answer的会话，标记为已停止
            if (history[i].answer === "") {
              history[i].answer = "*搜索已停止*";
              
              // 如果没有message_id，生成一个临时ID
              if (!history[i].message_id) {
                history[i].message_id = `temp-msg-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
                console.log("为已停止的会话生成临时消息ID:", history[i].message_id);
              }

              // 保存更新后的历史记录
              localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
              console.log("已更新已停止的会话状态");
              break;
            }
          }
        }
      } catch (e) {
        console.error("更新已停止的会话状态失败:", e);
      }
    }

    return true;
  } catch (error) {
    console.error("停止搜索时出错:", error);
    return false;
  }
};

// 创建axios实例
const createAPI = () => {
  const appConfig = useAppConfigStore();

  return axios.create({
    baseURL: appConfig.config.APP_URL,
    timeout: 60000,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${appConfig.config.APP_KEY}`,
    },
  });
};

// 获取或创建用户标识
export const getUserId = (): string => {
  const STORAGE_KEY = "aisearch_user_id";

  // 尝试从localStorage获取用户ID
  let userId = localStorage.getItem(STORAGE_KEY);

  // 如果不存在，则创建新的用户ID并保存
  if (!userId) {
    // 创建随机ID
    const randomPart = Math.random().toString(36).substring(2, 10);
    const timestamp = new Date().getTime().toString(36);
    userId = `user-${timestamp}-${randomPart}`;

    // 保存到本地存储
    try {
      localStorage.setItem(STORAGE_KEY, userId);
      console.log("创建并保存新用户标识:", userId);
    } catch (e) {
      console.error("无法保存用户标识到本地存储:", e);
    }
  }

  return userId;
};

// 会话历史记录管理
export interface ChatSession {
  id: string;
  conversation_id: string;
  message_id: string;
  query: string;
  search_type: string;
  timestamp: number;
  answer?: string;
  model?: string; // 添加模型字段
  files?: Array<{
    id: string;
    name: string;
    type: string;
    size: number;
    url?: string;
  }>;
}

// 保存会话记录到本地存储
export const saveChatSession = (session: ChatSession): void => {
  try {
    const STORAGE_KEY = "aisearch_chat_history";

    // 检查session对象，确保有必要的字段
    if (!session.id || !session.query) {
      console.error("会话对象缺少必要字段，无法保存");
      return;
    }

    // 确保有answer字段 (哪怕是空字符串)
    if (session.answer === undefined) {
      session.answer = "";
    }

    console.log("保存会话历史:", session);

    // 获取现有历史记录
    const historyJson = localStorage.getItem(STORAGE_KEY);
    let history: ChatSession[] = [];

    if (historyJson) {
      try {
        history = JSON.parse(historyJson);
      } catch (e) {
        console.error("解析历史记录失败，创建新的历史记录", e);
        history = [];
      }
    }

    // 检查是否已存在相同ID的会话，如果存在则更新
    const existingIndex = history.findIndex((item) => item.id === session.id);
    if (existingIndex >= 0) {
      history[existingIndex] = session;
      console.log("更新已存在的会话:", session.id);
    } else {
      // 添加新会话到历史记录
      history.unshift(session); // 添加到开头，最新的在最前面
    }

    // 限制历史记录数量，最多保留50条
    if (history.length > 50) {
      history = history.slice(0, 50);
    }

    // 保存到本地存储
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
    console.log("会话历史已保存/更新");
  } catch (e) {
    console.error("保存会话历史失败:", e);
  }
};

// 获取历史会话记录
export const getChatHistory = (): ChatSession[] => {
  try {
    const STORAGE_KEY = "aisearch_chat_history";
    const historyJson = localStorage.getItem(STORAGE_KEY);

    if (historyJson) {
      const history: ChatSession[] = JSON.parse(historyJson);
      
      // 向后兼容：检查并为没有message_id的旧记录添加一个
      for (let i = 0; i < history.length; i++) {
        if (!history[i].message_id) {
          history[i].message_id = `legacy-msg-${history[i].id}-${Math.random().toString(36).substring(2, 10)}`;
          console.log("为旧记录生成消息ID:", history[i].message_id);
        }
      }
      
      // 将更新后的历史记录保存回本地存储
      localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
      
      return history;
    }
  } catch (e) {
    console.error("获取历史记录失败:", e);
  }

  return [];
};

// 清除历史会话记录
export const clearChatHistory = (): void => {
  try {
    localStorage.removeItem("aisearch_chat_history");
    console.log("历史记录已清除");
  } catch (e) {
    console.error("清除历史记录失败:", e);
  }
};

// 处理流式搜索响应的核心功能
function processStreamingSearch(
  apiUrl: string,
  requestData: any,
  sessionData: ChatSession,
  onData: (data: any) => void,
  onFinish: (sessionData?: ChatSession) => void,
  onError: (error: any) => void
) {
  // 如果是聊天模式，使用ChatGPT API处理
  if (sessionData.search_type === SearchType.CHAT) {
    console.log('使用ChatGPT API处理聊天请求，模型:', sessionData.model);
    searchInProgress = true;
    
    // 调用ChatGPT API
    const { controller, sessionData: updatedSession } = chatgptAPI.streamChat(
      sessionData.query,
      {
        model: sessionData.model, // 使用会话中指定的模型
        files: sessionData.files
      },
      (data) => {
        // 处理流式数据 - 转换为与DIFY API兼容的格式
        onData({
          event: 'message',
          answer: data.answer || data.text,
          message_id: data.message_id
        });
      },
      (completedSession) => {
        // 消息结束事件
        if (completedSession && completedSession.message_id) {
          onData({
            event: 'message_end',
            message_id: completedSession.message_id
          });
        }
        
        // 搜索完成
        searchInProgress = false;
        currentSearchTask = null;
        onFinish(completedSession);
      },
      (error) => {
        // 处理错误
        searchInProgress = false;
        currentSearchTask = null;
        onError(error);
      },
      sessionData.conversation_id
    );
    
    // 更新当前搜索任务的控制器
    currentSearchTask = { id: sessionData.id, controller };
    
    return;
  }
  // 创建AbortController用于取消请求
  const controller = new AbortController();
  currentSearchTask = { id: sessionData.id, controller };

  fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${requestData.appKey}`,
    },
    body: JSON.stringify(requestData.body),
    signal: controller.signal,
  })
    .then((response) => {
      if (!response.ok) {
        searchInProgress = false; // 重置状态
        currentSearchTask = null;
        throw new Error("搜索请求失败: " + response.status);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        searchInProgress = false; // 重置状态
        currentSearchTask = null;
        throw new Error("无法获取响应流");
      }

      // 解码器
      const decoder = new TextDecoder();
      let buffer = ""; // 用于存储未完成的数据块
      fullAnswer = ""; // 存储完整回答

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

            // 保存会话记录到本地存储
            if (sessionData.conversation_id) {
              saveChatSession(sessionData);
            }

            // 调用完成回调
            onFinish(sessionData);

            // 重置搜索状态
            searchInProgress = false;
            currentSearchTask = null;

            return;
          }

          // 解码数据并添加到缓冲区
          buffer += decoder.decode(value, { stream: true });

          // 按 SSE 数据块分割（使用\n\n作为分隔符）
          const parts = buffer.split("\n\n");

          // 处理除最后一个可能不完整的数据块外的所有数据块
          for (let i = 0; i < parts.length - 1; i++) {
            if (parts[i].trim().startsWith("data:")) {
              try {
                processData(parts[i]);
              } catch (e) {
                console.error("处理数据块时出错:", e, parts[i]);
              }
            }
          }

          // 保留最后一个可能不完整的数据块
          buffer = parts[parts.length - 1];

          // 继续读取流
          return processStream();
        });
      }

      // 处理单个数据块
      function processData(dataText: string) {
        const jsonStr = dataText.replace(/^data:\s*/, "").trim();
        if (!jsonStr) return;

        try {
          const data = JSON.parse(jsonStr);

          // 处理会话ID
          if (data.conversation_id && !sessionData.conversation_id) {
            sessionData.conversation_id = data.conversation_id;
            console.log("会话ID已更新:", data.conversation_id);
          }

          // 处理消息ID
          if (data.message_id && !sessionData.message_id) {
            sessionData.message_id = data.message_id;
            console.log("消息ID已更新:", data.message_id);
            
            // 检查是否有上传文件
            const hasUploadedFiles = sessionData.files && sessionData.files.length > 0;
            
            // 调用Serper API
            if (sessionData.query && !hasUploadedFiles) {
              searchWithSerper(sessionData.query, data.message_id);
            } else if (hasUploadedFiles) {
              console.log("文件已上传，不调用Serper API，消息ID:", data.message_id);
            }
          }

          // 处理task_id
          if (data.task_id && currentSearchTask) {
            currentSearchTask.id = data.task_id;
            console.log("任务ID已更新:", data.task_id);
          }

          // 处理message_end事件中的message_id
          if (dataText.includes('event: message_end')) {
            if (data.message_id && !sessionData.message_id) {
              sessionData.message_id = data.message_id;
              console.log("消息ID从message_end事件更新:", data.message_id, "查询:", sessionData.query);
              
              // 检查是否有上传文件
              const hasUploadedFiles = sessionData.files && sessionData.files.length > 0;
              
              if (sessionData.query && !hasUploadedFiles) {
                // 只有在没有上传文件时才调用Serper API
                searchWithSerper(sessionData.query, data.message_id);
              } else if (hasUploadedFiles) {
                console.log("文件已上传，从message_end事件跳过Serper搜索，消息ID:", data.message_id);
              }
            }
          }

          // 处理消息内容
          if (data.text) {
            fullAnswer += data.text;
            data.answer = data.text; // 方便回调处理
          } else if (data.answer) {
            // 有些API直接返回完整的answer
            fullAnswer += data.answer;
          }

          // 调用数据处理回调
          onData(data);
        } catch (e) {
          console.error("解析或处理数据时出错:", e);
          if (onError) {
            onError(e);
          }
        }
      }

      // 开始处理流
      return processStream();
    })
    .catch((err) => {
      searchInProgress = false; // 重置状态
      currentSearchTask = null;

      // 如果搜索被用户中止，生成临时消息ID
      if (err.name === "AbortError" && sessionData.id) {
        // 生成临时消息ID用于保存中止的会话
        sessionData.message_id = sessionData.message_id || `temp-msg-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
        
        // 确保有会话ID
        if (!sessionData.conversation_id) {
          sessionData.conversation_id = `temp-conv-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
        }
        
        // 保存中止时的回答
        sessionData.answer = fullAnswer || "搜索被中止";
        
        // 保存会话（哪怕是中止的）
        if (sessionData.id && sessionData.query) {
          saveChatSession(sessionData);
        }
        
        console.log("搜索被用户中止，生成临时ID:", sessionData.message_id);
      }
    });
}

// 封装搜索API
export const searchAPI = {
  /**
   * 发送搜索请求
   * @param query 搜索查询内容
   * @param type 搜索类型
   * @param options 额外选项
   * @returns Promise
   */
  search: async (query: string, type: string, options?: any) => {
    const api = createAPI();

    // 构建请求参数
    const params: any = {
      query,
      inputs: {
        // 传递搜索类型
        search_type: type,
        // 传递其他选项
        ...(options || {}),
      },
      response_mode: "streaming", // 使用流式响应
      user: getUserId(), // 获取或创建用户标识
    };

    // 如果有文件，按照API规范添加到files下
    if (options?.files && options.files.length > 0) {
      // u786eu4fddu6bcfu4e2au6587u4ef6u90fdu6709u6b63u786eu7684u7c7bu578bu548cID
      const validFiles = options.files.filter((file: any) => file && file.id);
      
      if (validFiles.length > 0) {
        params.files = validFiles.map((file: any) => {
          // 使用正确的顺序获取文件类型信息：首选mime_type，其次extension，最后是type
          // 如果文件对象中包含mime_type，优先使用它
          let fileTypeInfo = file.mime_type || '';
          
          // 如果没有mime_type但有extension，使用extension
          if (!fileTypeInfo && file.extension) {
            fileTypeInfo = file.extension;
          }
          
          // 最后才考虑type字段，并且只有当type不是分类标签时才使用
          if (!fileTypeInfo && file.type && !['image', 'document', 'audio', 'video', 'custom'].includes(file.type)) {
            fileTypeInfo = file.type;
          }
          
          const fileType = getFileType(fileTypeInfo);
          console.log('文件信息详情:', {
            id: file.id,
            name: file.name,
            mime_type: file.mime_type,
            extension: file.extension,
            type: file.type,
            fileTypeInfo: fileTypeInfo,
            detectedType: fileType
          });
          
          // 如果文件对象中已经包含正确的类型分类，优先使用它
          // 否则使用我们检测到的类型
          const finalType = ['image', 'document', 'audio', 'video'].includes(file.type) 
            ? file.type 
            : fileType;
          
          return {
            type: finalType,
            transfer_method: 'local_file',
            upload_file_id: file.id,
            url: ""
          };
        });
        
        // 输出最终构建的搜索请求参数
        console.log('最终构建的搜索请求参数:', JSON.stringify(params));
      }
      
      // u4eceinputsu4e2du5220u9664files
      if (params.inputs.files) {
        delete params.inputs.files;
      }
    }

    return api.post("/chat-messages", params);
  },

  /**
   * 处理流式搜索响应
   * @param query 搜索查询
   * @param type 搜索类型
   * @param options 附加选项
   * @param onData 数据处理回调
   * @param onFinish 完成回调
   * @param onError 错误回调
   * @param conversation_id 可选的会话ID，用于继续现有对话
   */
  streamSearch: (
    query: string,
    type: string,
    options: SearchOptions,
    onData: (data: any) => void,
    onFinish: (sessionData?: ChatSession) => void,
    onError: (error: any) => void,
    conversation_id?: string
  ) => {
    // 防止重复请求：如果已有搜索正在进行中，则忽略新的请求
    if (searchInProgress) {
      console.log("搜索正在进行中，忽略新的请求");
      return;
    }

    // 标记搜索已开始
    searchInProgress = true;

    // 获取应用配置
    const appConfig = useAppConfigStore();

    // 存储会话信息
    let sessionData: ChatSession = {
      id: Date.now().toString(36) + Math.random().toString(36).substr(2),
      conversation_id: "", // 将在响应中获取
      message_id: "", // 将在响应中获取
      query: query,
      search_type: type,
      timestamp: Date.now(),
      answer: "",
      model: options.model, // 添加模型信息
      files: options.files || [], // 保存文件列表
    };

    // 构建请求数据
    const requestData: any = {
      appKey: appConfig.config.APP_KEY,
      body: {
        query: query, // 搜索查询文本
        inputs: {
          search_type: type, // 将搜索类型作为参数传递
          ...(options || {}),
        },
        response_mode: "streaming", // 使用流式响应模式
        user: getUserId(), // 获取或创建用户标识
        conversation_id: conversation_id || "", // 传递会话ID（如果有）
      },
    };

    // 如果有文件，按照API规范添加到files下
    if (options.files && options.files.length > 0) {
      // u786eu4fddu6bcfu4e2au6587u4ef6u90fdu6709u6b63u786eu7684u7c7bu578bu548cID
      const validFiles = options.files.filter((file: any) => file && file.id);
      
      if (validFiles.length > 0) {
        requestData.body.files = validFiles.map((file: any) => {
          // 使用正确的顺序获取文件类型信息：首选mime_type，其次extension，最后是type
          // 如果文件对象中包含mime_type，优先使用它
          let fileTypeInfo = file.mime_type || '';
          
          // 如果没有mime_type但有extension，使用extension
          if (!fileTypeInfo && file.extension) {
            fileTypeInfo = file.extension;
          }
          
          // 最后才考虑type字段，并且只有当type不是分类标签时才使用
          if (!fileTypeInfo && file.type && !['image', 'document', 'audio', 'video', 'custom'].includes(file.type)) {
            fileTypeInfo = file.type;
          }
          
          const fileType = getFileType(fileTypeInfo);
          console.log('文件信息详情:', {
            id: file.id,
            name: file.name,
            mime_type: file.mime_type,
            extension: file.extension,
            type: file.type,
            fileTypeInfo: fileTypeInfo,
            detectedType: fileType
          });
          
          // 如果文件对象中已经包含正确的类型分类，优先使用它
          // 否则使用我们检测到的类型
          const finalType = ['image', 'document', 'audio', 'video'].includes(file.type) 
            ? file.type 
            : fileType;
          
          return {
            type: finalType,
            transfer_method: 'local_file',
            upload_file_id: file.id,
            url: ""
          };
        });
        
        // 输出最终构建的搜索请求参数
        console.log('最终构建的搜索请求参数:', JSON.stringify(requestData));
      }
      
      // u4eceinputsu4e2du5220u9664files
      if (requestData.body.inputs.files) {
        delete requestData.body.inputs.files;
      }
    }

    // 调用流式处理函数
    processStreamingSearch(
      `${appConfig.config.APP_URL}/chat-messages`,
      requestData,
      sessionData,
      onData,
      onFinish,
      onError
    );
  },

  /**
   * 防抖包装的搜索函数，避免短时间内多次触发
   */
  debouncedStreamSearch: debounce(
    (
      query: string,
      type: string,
      options: SearchOptions,
      onData: (data: any) => void,
      onFinish: (sessionData?: ChatSession) => void,
      onError: (error: any) => void,
      conversation_id?: string
    ) => {
      searchAPI.streamSearch(
        query,
        type,
        options,
        onData,
        onFinish,
        onError,
        conversation_id
      );
    },
    300
  ), // 300毫秒延迟

  /**
   * 继续现有对话
   * @param sessionData 现有会话数据
   * @param query 新的查询内容
   * @param onData 数据处理回调
   * @param onComplete 完成回调
   * @param onError 错误回调
   */
  continueChat: (
    sessionData: ChatSession,
    query: string,
    onData: (data: any) => void,
    onComplete: (sessionData?: ChatSession) => void,
    onError: (error: any) => void
  ) => {
    if (searchInProgress) {
      console.log("搜索正在进行中，忽略新的请求");
      return;
    }

    // 标记搜索已开始
    searchInProgress = true;

    // 获取应用配置
    const appConfig = useAppConfigStore();

    // 创建新的用户问题会话
    const newSession: ChatSession = {
      id: Date.now().toString(36) + Math.random().toString(36).substr(2),
      conversation_id: sessionData.conversation_id,
      message_id: "", // 将在响应中获取
      query: query,
      search_type: sessionData.search_type,
      timestamp: Date.now(),
      model: sessionData.model, // 保持使用相同的模型
    };

    // 如果是聊天模式，直接使用ChatGPT API
    if (sessionData.search_type === SearchType.CHAT) {
      console.log('继续聊天使用ChatGPT API，模型:', newSession.model);
      // 调用流式处理函数，使用ChatGPT API
      processStreamingSearch(
        "", // apiUrl不需要，因为在chatgptAPI中已经处理
        {}, // requestData不需要，因为在chatgptAPI中已经处理
        newSession,
        onData,
        onComplete,
        onError
      );
      return;
    }

    // 非聊天模式，使用原有的DIFY API
    // 构建请求数据
    const requestData = {
      appKey: appConfig.config.APP_KEY,
      body: {
        query: query,
        inputs: {
          search_type: sessionData.search_type,
        },
        response_mode: "streaming",
        user: getUserId(),
        conversation_id: sessionData.conversation_id,
      },
    };

    // 调用流式处理函数
    processStreamingSearch(
      `${appConfig.config.APP_URL}/chat-messages`,
      requestData,
      newSession,
      onData,
      onComplete,
      onError
    );
  },

  /**
   * 停止当前搜索响应
   */
  stopSearch: async () => {
    return stopSearchResponse();
  },
  
  /**
   * 获取下一轮建议问题列表
   * @param messageId 消息ID
   * @returns Promise
   */
  getSuggestedQuestions(messageId: string) {
    // 检查消息ID格式，确保是UUID格式
    // 检查消息ID格式是否为UUID格式（包含连字符的标准格式）
    if (!messageId.includes('-') && messageId.length < 32) {
      console.warn("消息ID不是标准UUID格式，可能导致API请求失败:", messageId);
      return Promise.resolve([]);
    }
    
    const config = useAppConfigStore();
    const api = createAPI();
    const userId = getUserId();
    
    return api.get(`/messages/${messageId}/suggested`, {
      params: {
        user: userId
      }
    })
    .then(response => {
      if (response.data && response.data.result === "success") {
        return response.data.data;
      }
      return [];
    })
    .catch(error => {
      console.error("获取建议问题失败:", error);
      return [];
    });
  },
  
  /**
   * 后续提问
   * @param conversationId 会话ID
   * @param query 查询内容
   * @param options 搜索选项
   * @param onData 数据处理回调
   * @param onComplete 完成回调
   * @param onError 错误回调
   */
  followupQuestion: (
    conversationId: string,
    query: string,
    options: SearchOptions = {},
    onData?: (data: any) => void,
    onComplete?: () => void,
    onError?: (error: any) => void
  ): void => {
    try {
      // 创建一个新的会话，但使用现有的会话ID
      let sessionData: ChatSession = {
        id: Date.now().toString(36) + Math.random().toString(36).substr(2),
        conversation_id: conversationId,
        message_id: "", // 将在响应中获取
        query: query,
        search_type: options?.searchType || SearchType.WEB,
        timestamp: Date.now(),
        answer: "",
      };

      // 处理流数据的函数
      const processData = (data: any) => {
        if (data.answer) {
          sessionData.answer = (sessionData.answer || "") + data.answer;
        }

        // 处理消息ID，并在获取到时调用Serper API
        if (data.message_id && !sessionData.message_id) {
          sessionData.message_id = data.message_id;
          console.log("后续提问消息ID已更新:", data.message_id, "查询:", query);
          // 同步调用Serper API，确保使用当前问题查询
          searchWithSerper(query, data.message_id);
        }

        // 回调函数
        if (onData) {
          onData(data);
        }
      };

      // 获取应用配置
      const appConfig = useAppConfigStore();

      // 构建请求数据
      const requestData = {
        appKey: appConfig.config.APP_KEY,
        body: {
          query: query,
          inputs: {
            search_type: options?.searchType || SearchType.WEB,
          },
          response_mode: "streaming",
          user: getUserId(),
          conversation_id: conversationId,
        },
      };

      // 调用流式处理函数
      processStreamingSearch(
        `${appConfig.config.APP_URL}/chat-messages`,
        requestData,
        sessionData,
        processData,
        onComplete,
        onError
      );
    } catch (error) {
      console.error("后续提问出错:", error);
      if (onError) {
        onError(error);
      }
    }
  },
  
  /**
   * 上传文件
   * @param file 文件对象
   * @returns Promise 包含文件信息
   */
  uploadFile: async (file: File) => {
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('user', getUserId());
      
      const appConfig = useAppConfigStore();
      const api = createAPI();
      
      const response = await api.post(`${appConfig.config.APP_URL}/files/upload`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      
      // 处理文件类型和扩展名
      const fileData = response.data;
      if (fileData && fileData.extension) {
        // 去除可能的前导点
        fileData.extension = fileData.extension.replace(/^\./, '');
      }
      
      // 处理文件类型
      if (fileData && fileData.extension) {
        fileData.type = getFileType(fileData.extension);
      }
      
      return fileData;
    } catch (error) {
      console.error('文件上传失败:', error);
      throw error;
    }
  },
  
  /**
   * 批量上传文件
   * @param files 文件列表
   * @param onProgress 上传进度回调
   * @returns Promise 包含所有上传文件的信息
   */
  uploadFiles: async (files: File[], onProgress?: (percent: number) => void) => {
    try {
      const promises = files.map(file => searchAPI.uploadFile(file));
      return await Promise.all(promises);
    } catch (error) {
      console.error('批量上传文件失败:', error);
      throw error;
    }
  },

  /**
   * 获取文件信息
   * @param fileId 文件ID
   * @returns Promise 包含文件详情
   */
  getFileInfo: async (fileId: string) => {
    try {
      const appConfig = useAppConfigStore();
      const api = createAPI();
      
      const response = await api.get(`${appConfig.config.APP_URL}/files/${fileId}`);
      return response.data;
    } catch (error) {
      console.error('获取文件信息失败:', error);
      throw error;
    }
  },

  /**
   * 删除上传的文件
   * @param fileId 文件ID
   * @returns Promise
   */
  deleteFile: async (fileId: string) => {
    try {
      const appConfig = useAppConfigStore();
      const api = createAPI();
      
      const response = await api.delete(`${appConfig.config.APP_URL}/files/${fileId}`);
      return response.data;
    } catch (error) {
      console.error('删除文件失败:', error);
      throw error;
    }
  },
  
  /**
   * 获取会话历史消息
   * @param conversation_id 会话ID
   * @param message_id 消息ID
   * @returns Promise 包含消息详情和文件预览URL
   */
  getHistoryMessages: async (conversation_id: string, message_id?: string) => {
    try {
      if (!conversation_id) {
        console.warn('获取会话历史需要会话ID');
        return null;
      }

      const appConfig = useAppConfigStore();
      const userId = getUserId();

      console.log('获取会话历史消息，会话ID:', conversation_id);
      
      // 直接使用createAPI函数创建的axios实例
      const api = createAPI();
      const queryParams = {
        conversation_id,
        user: userId,
        limit: 5, // 只获取最新的几条消息
      };

      // 直接使用/messages路径，baseURL已在createAPI中设置
      const response = await api.get('/messages', {
        params: queryParams,
      });

      if (response.data && response.data.data && response.data.data.length > 0) {
        console.log('获取到会话历史消息:', response.data.data.length, '条');
        return response.data.data;
      } else {
        console.warn('未找到会话历史消息');
        return null;
      }
    } catch (error) {
      console.error('获取会话历史消息失败:', error);
      return null;
    }
  },

  /**
   * 更新会话中的文件预览URL
   * @param sessionData 会话数据
   * @returns Promise 更新后的会话数据
   */
  updateFilePreviewUrls: async (sessionData: ChatSession) => {
    try {
      if (!sessionData.conversation_id || !sessionData.message_id) {
        console.warn('更新文件预览URL需要会话ID和消息ID');
        return sessionData;
      }

      // 获取会话历史消息
      const messages = await searchAPI.getHistoryMessages(sessionData.conversation_id);
      if (!messages || messages.length === 0) {
        return sessionData;
      }

      // 查找匹配当前消息ID的消息
      const currentMessage = messages.find(msg => msg.id === sessionData.message_id);
      if (!currentMessage) {
        console.warn('未找到匹配的消息:', sessionData.message_id);
        return sessionData;
      }

      // 获取message_files
      if (currentMessage.message_files && currentMessage.message_files.length > 0) {
        console.log('找到消息文件:', currentMessage.message_files.length, '个');
        
        // 打印详细的消息文件信息用于调试
        console.log('消息文件详情:', JSON.stringify(currentMessage.message_files));
        
        // 更新sessionData中的文件URL
        if (sessionData.files && sessionData.files.length > 0) {
          // 打印上传文件信息用于调试
          console.log('会话中的文件:', sessionData.files.map(f => ({ id: f.id, name: f.name })));
          
          sessionData.files = sessionData.files.map(file => {
            // 查找匹配的message_file
            // 注意：API返回的文件ID可能与上传文件ID不同，可能需要通过其他方式匹配
            const messageFile = currentMessage.message_files.find(mf => mf.id === file.id);
            if (messageFile && messageFile.url) {
              console.log('通过ID匹配更新文件预览URL:', file.name, messageFile.url);
              return { ...file, url: messageFile.url };
            } else {
              // 如果通过ID找不到匹配，检查是否只有一个文件，简单匹配第一个
              if (sessionData.files.length === 1 && currentMessage.message_files.length === 1) {
                const firstMessageFile = currentMessage.message_files[0];
                if (firstMessageFile && firstMessageFile.url) {
                  console.log('通过索引匹配更新文件预览URL:', file.name, firstMessageFile.url);
                  return { ...file, url: firstMessageFile.url };
                }
              }
              // 可以尝试按类型匹配
              const typeMatchedFile = currentMessage.message_files.find(mf => mf.type === file.type);
              if (typeMatchedFile && typeMatchedFile.url) {
                console.log('通过类型匹配更新文件预览URL:', file.name, typeMatchedFile.url);
                return { ...file, url: typeMatchedFile.url };
              }
            }
            return file;
          });
        }

        // 保存更新后的会话历史
        saveChatSession(sessionData);
        console.log('已更新文件预览URL并保存会话');
      } else {
        console.log('该消息没有关联文件');
      }

      return sessionData;
    } catch (error) {
      console.error('更新文件预览URL失败:', error);
      return sessionData;
    }
  },
};

/**
 * 根据文件类型或扩展名确定文件类别
 * @param fileType 文件MIME类型或扩展名
 * @returns 文件类别: document, image, audio, video 或 custom
 */
const getFileType = (fileType: string): string => {
  if (!fileType) return 'custom';
  
  // 处理可能的MIME类型或文件扩展名
  const input = fileType.toLowerCase().trim();
  let extension = '';
  
  // 日志输出调试信息
  console.log('检查文件类型或扩展名:', input);
  
  // 如果包含斜杠，可能是MIME类型 (如 'image/jpeg')
  if (input.includes('/')) {
    extension = input.split('/').pop() || '';
    console.log('从MIME类型中提取扩展名:', extension);
    
    // 处理可能带点的子类型 (如 'vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    if (extension.includes('.')) {
      const parts = extension.split('.');
      console.log('从MIME类型中提取最后一部分:', parts[parts.length - 1]);
      const lastPart = parts[parts.length - 1];
      if (lastPart === 'sheet') return 'document'; // Excel
      if (lastPart === 'document') return 'document'; // Word
      if (lastPart === 'presentation') return 'document'; // PowerPoint
    }
    
    // 如果是 image/ 开头的MIME类型，直接返回 image
    if (input.startsWith('image/')) {
      console.log('MIME类型以 image/ 开头，返回 image');
      return 'image';
    }
  } else {
    // 去除可能的前导点
    extension = input.replace(/^\./, '');
    console.log('文件扩展名:', extension);
  }
  
  // 文档类型 - 完全符合文档规范
  if (['txt', 'md', 'markdown', 'pdf', 'html', 'xlsx', 'xls', 'docx', 'doc', 'csv', 'eml', 'msg', 'pptx', 'ppt', 'xml', 'epub'].includes(extension)) {
    return 'document';
  }
  
  // 图片类型 - 完全符合文档规范
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(extension)) {
    return 'image';
  }
  
  // 音频类型 - 完全符合文档规范
  if (['mp3', 'm4a', 'wav', 'webm', 'amr'].includes(extension)) {
    return 'audio';
  }
  
  // 视频类型 - 完全符合文档规范
  if (['mp4', 'mov', 'mpeg', 'mpga'].includes(extension)) {
    return 'video';
  }
  
  // 对于通用MIME类型前缀的处理
  if (input.startsWith('audio/')) return 'audio';
  if (input.startsWith('video/')) return 'video';
  if (input.startsWith('text/')) return 'document';
  if (input.startsWith('application/pdf')) return 'document';
  if (input.startsWith('application/msword')) return 'document';
  if (input.startsWith('application/vnd.ms-excel')) return 'document';
  if (input.startsWith('application/vnd.ms-powerpoint')) return 'document';
  
  // 其他类型归为自定义类型
  console.log('无法识别的文件类型，返回 custom');
  return 'custom';
};

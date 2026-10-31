/**
 * 账号管理模块接口（真实定义）。
 * 桩实现：StubAccountService。真实实现：#9（凭据经 PlatformServices.credentials 安全存储）。
 */
import type { Account, Provider } from '../model/types';

export interface AddAccountInput {
  provider: Provider;
  email: string;
  alias?: string;
  color?: string;
  /** 授权码：只经连接测试与凭据存储流转，禁止落日志/落盘明文（#9） */
  authCode: string;
}

export interface ConnectionTestResult {
  ok: boolean;
  error?: string;
}

export interface AccountService {
  list(): Account[];
  /** 重复邮箱（规范化小写）阻止添加（Proposal 验收：同一邮箱重复添加阻止） */
  add(input: AddAccountInput): Account;
  update(id: string, patch: Partial<Pick<Account, 'alias' | 'color'>>): Account;
  remove(id: string): void;
  testConnection(input: AddAccountInput): Promise<ConnectionTestResult>;
  reauthorize(id: string, newAuthCode: string): Promise<ConnectionTestResult>;
  /** 备注名为空时的默认名（邮箱前缀 6-8 字符 + 序号；#9 落地完整规则） */
  defaultAlias(email: string): string;
}

/**
 * 内容摘要（MotionLibrary Spec v1.0 §4.4）：
 * contentDigest 用现有可用的 SHA-256 实现对规范化 JSON 计算（不替换旧档案的 FNV 摘要算法）。
 * 摘要不是签名：导入时必须实际重算，不能信任文件自报值。
 */
import { canonicalJson } from "../../rig/controlProfile.js";

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** SHA-256（WebCrypto；node ≥15 / 浏览器均可用），返回 "sha256-<hex>"。 */
export async function sha256Json(value: unknown): Promise<string> {
  const data = new TextEncoder().encode(canonicalJson(value));
  const digest = await crypto.subtle.digest("SHA-256", data);
  return `sha256-${toHex(digest)}`;
}

/** 计算 entry 的 contentDigest：排除自身 digest 字段，纳入所有被引用资产摘要（由调用方把
 *  rigRef/source 中携带的摘要一并写入待哈希对象）。 */
export async function entryContentDigest(entry: Omit<import("./contracts.js").MotionEntry, "contentDigest">): Promise<string> {
  return sha256Json(entry);
}

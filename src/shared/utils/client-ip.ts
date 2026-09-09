import net from 'node:net';
import type { Env } from '../../config/env.js';

const blockListCache = new Map<string, net.BlockList>();

function createBlockList(trustedProxies: readonly string[]): net.BlockList {
  const blockList = new net.BlockList();
  for (const entry of trustedProxies) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    if (trimmed.includes('/')) {
      const parts = trimmed.split('/');
      const addr = parts[0];
      const prefixStr = parts[1];
      if (addr && prefixStr) {
        const prefix = parseInt(prefixStr, 10);
        const type = net.isIP(addr);
        if (type === 4 && prefix >= 0 && prefix <= 32) {
          blockList.addSubnet(addr, prefix, 'ipv4');
        } else if (type === 6 && prefix >= 0 && prefix <= 128) {
          blockList.addSubnet(addr, prefix, 'ipv6');
        }
      }
    } else {
      const type = net.isIP(trimmed);
      if (type === 4) blockList.addAddress(trimmed, 'ipv4');
      else if (type === 6) blockList.addAddress(trimmed, 'ipv6');
    }
  }
  return blockList;
}

function getOrCreateBlockList(trustedProxies: readonly string[]): net.BlockList {
  const key = trustedProxies.join(',');
  let blockList = blockListCache.get(key);
  if (!blockList) {
    blockList = createBlockList(trustedProxies);
    blockListCache.set(key, blockList);
  }
  return blockList;
}

function isIpTrusted(blockList: net.BlockList, ip: string): boolean {
  const type = net.isIP(ip);
  if (type === 4) return blockList.check(ip, 'ipv4');
  if (type === 6) return blockList.check(ip, 'ipv6');
  return false;
}

/** `true` se `ip` pertence a algum CIDR/endereço de `trustedProxies`. */
export function isTrustedProxy(ip: string, trustedProxies: readonly string[]): boolean {
  if (trustedProxies.length === 0) {
    return false;
  }
  const blockList = getOrCreateBlockList(trustedProxies);
  return isIpTrusted(blockList, ip);
}

/**
 * Predicado de confiança do Fastify. Um salto só é confiável se estiver dentro
 * da profundidade declarada (D-50) E o endereço for de um proxy da borda.
 */
export function buildTrustProxy(config: Env): ((address: string, hop: number) => boolean) | false {
  if (config.TRUST_PROXY_HOPS === 0 || config.TRUSTED_PROXY_LIST.length === 0) {
    return false;
  }

  return (address: string, hop: number) =>
    hop < config.TRUST_PROXY_HOPS && isTrustedProxy(address, config.TRUSTED_PROXY_LIST);
}

export function resolveClientIp(
  headers: Record<string, string | string[] | undefined>,
  trustedProxies: readonly string[],
  socketIp: string,
): string {
  if (trustedProxies.length === 0) {
    return socketIp;
  }

  const rawHeader = headers['x-forwarded-for'] ?? headers['X-Forwarded-For'];
  if (!rawHeader) {
    return socketIp;
  }

  const headerStr = Array.isArray(rawHeader) ? rawHeader.join(',') : rawHeader;
  const ips = headerStr
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (ips.length === 0) {
    return socketIp;
  }

  const blockList = getOrCreateBlockList(trustedProxies);

  // Se o socket que conectou diretamente não for de um proxy confiável,
  // a requisição veio direto do cliente ou de um salto não autorizado; o XFF foi forjado.
  if (!isIpTrusted(blockList, socketIp)) {
    return socketIp;
  }

  // Varredura rigorosa da direita para a esquerda:
  // O primeiro salto que NÃO pertencer a nenhum CIDR confiável é o cliente.
  for (let i = ips.length - 1; i >= 0; i--) {
    const candidate = ips[i];
    if (candidate && !isIpTrusted(blockList, candidate)) {
      return candidate;
    }
  }

  // Se todos os saltos forem confiáveis, o cliente é o socketIp original.
  return socketIp;
}

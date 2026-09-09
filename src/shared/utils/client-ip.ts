import net from 'node:net';

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
        if (type === 4) blockList.addSubnet(addr, prefix, 'ipv4');
        else if (type === 6) blockList.addSubnet(addr, prefix, 'ipv6');
      }
    } else {
      const type = net.isIP(trimmed);
      if (type === 4) blockList.addAddress(trimmed, 'ipv4');
      else if (type === 6) blockList.addAddress(trimmed, 'ipv6');
    }
  }
  return blockList;
}

function isIpTrusted(blockList: net.BlockList, ip: string): boolean {
  const type = net.isIP(ip);
  if (type === 4) return blockList.check(ip, 'ipv4');
  if (type === 6) return blockList.check(ip, 'ipv6');
  return false;
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

  const blockList = createBlockList(trustedProxies);

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

// ============================================================================
// WebDAV 云同步 纯函数单元测试（不触网）
// ============================================================================
import { describe, it, expect } from 'vitest';
import { buildWebdavPath, backupFilename, parsePropfind } from './webdav';

describe('buildWebdavPath（路径拼接规范化）', () => {
  it('目录 + 文件：拼接单斜杠', () => {
    expect(buildWebdavPath('ai-novel-workshop', 'backup_x.json')).toBe('ai-novel-workshop/backup_x.json');
  });

  it('目录两端多余斜杠被规范化', () => {
    expect(buildWebdavPath('/dir/sub/', '/backup_x.json')).toBe('dir/sub/backup_x.json');
  });

  it('目录为空：仅返回文件名', () => {
    expect(buildWebdavPath('', 'backup_x.json')).toBe('backup_x.json');
    expect(buildWebdavPath('  ', 'backup_x.json')).toBe('backup_x.json');
  });
});

describe('backupFilename（命名与本地下载一致）', () => {
  it('标题非法字符清洗 + 日期段', () => {
    expect(backupFilename('我的/小说: 第一卷?', 1735660800000)).toBe(
      `backup_我的_小说_第一卷__${new Date(1735660800000).toISOString().slice(0, 10)}.json`
    );
  });

  it('正常标题保持原样', () => {
    const name = backupFilename('凡人修仙', 1735660800000);
    expect(name).toMatch(/^backup_凡人修仙_\d{4}-\d{2}-\d{2}\.json$/);
  });
});

describe('parsePropfind（multistatus XML 解析）', () => {
  const XML = `<?xml version="1.0" encoding="utf-8"?>
<D:multistatus xmlns:D="DAV:">
  <D:response>
    <D:href>/dav/ai-novel-workshop/</D:href>
    <D:propstat><D:prop><D:resourcetype><D:collection/></D:resourcetype></D:prop></D:propstat>
  </D:response>
  <D:response>
    <D:href>/dav/ai-novel-workshop/backup_%E5%87%A1%E4%BA%BA_2026-09-05.json</D:href>
    <D:propstat><D:prop>
      <D:getlastmodified>Thu, 04 Sep 2026 12:00:00 GMT</D:getlastmodified>
      <D:getcontentlength>2048</D:getcontentlength>
    </D:prop></D:propstat>
  </D:response>
  <D:response>
    <D:href>/dav/ai-novel-workshop/backup_%E9%81%93%E9%95%BF_2026-09-01.json</D:href>
    <D:propstat><D:prop>
      <D:getlastmodified>Mon, 31 Aug 2026 08:30:00 GMT</D:getlastmodified>
      <D:getcontentlength>1024</D:getcontentlength>
    </D:prop></D:propstat>
  </D:response>
</D:multistatus>`;

  it('跳过目录，仅保留文件', () => {
    const list = parsePropfind(XML);
    expect(list).toHaveLength(2);
    expect(list.every((b) => b.filename.endsWith('.json'))).toBe(true);
  });

  it('href URL 编码被解码，去掉服务端路径前缀', () => {
    const list = parsePropfind(XML);
    expect(list[0].filename).toBe('backup_凡人_2026-09-05.json');
    expect(list[0].path).toBe('dav/ai-novel-workshop/backup_凡人_2026-09-05.json');
    expect(list[0].size).toBe(2048);
  });

  it('按修改时间新→旧排序', () => {
    const list = parsePropfind(XML);
    expect(list[0].filename).toContain('2026-09-05');
    expect(list[1].filename).toContain('2026-09-01');
    expect(list[0].modifiedAt).toBe(Date.parse('Thu, 04 Sep 2026 12:00:00 GMT'));
  });

  it('无命名空间前缀 / getlastmodified 缺失也能解析', () => {
    const xml2 = `<multistatus xmlns="DAV:">
      <response>
        <href>/dav/b.json</href>
        <propstat><prop><getcontentlength>10</getcontentlength></prop></propstat>
      </response>
    </multistatus>`;
    const list = parsePropfind(xml2);
    expect(list).toHaveLength(1);
    expect(list[0].filename).toBe('b.json');
    expect(list[0].modifiedAt).toBeNull();
  });

  it('非法输入安全返回空数组', () => {
    expect(parsePropfind('')).toEqual([]);
    expect(parsePropfind('<html>404</html>')).toEqual([]);
  });
});

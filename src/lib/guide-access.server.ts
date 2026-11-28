import { setResponseStatus } from '@tanstack/react-start/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

export async function requireGuideAdmin(db: SupabaseClient<Database>, password: string) {
  if (!password) { setResponseStatus(401); throw new Error('전체관리자 인증이 필요합니다.'); }
  const { data: role, error } = await db.rpc('verify_password', { p: password });
  if (error) { setResponseStatus(500); throw new Error('권한 확인에 실패했습니다.'); }
  if (role !== 'admin') { setResponseStatus(401); throw new Error('전체관리자만 사용할 수 있습니다.'); }
}

export async function activeGuideSeason(db: SupabaseClient<Database>, expectedId?: string) {
  const { data, error } = await db.from('seasons').select('id, name').eq('is_active', true).maybeSingle();
  if (error) throw new Error('활성 시즌을 읽지 못했습니다.');
  if (expectedId && data?.id !== expectedId) throw new Error('현재 활성 시즌에서만 사용할 수 있습니다.');
  return data;
}

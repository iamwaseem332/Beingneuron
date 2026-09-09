import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface BenchmarkEnv {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  supabaseUserJwt: string;
  testUserId1: string;
  testUserId2: string;
}

let cachedClient: SupabaseClient | null = null;
let cachedServiceClient: SupabaseClient | null = null;

/**
 * Load environment variables from .env.benchmark file
 */
function loadEnv(): BenchmarkEnv {
  const requiredVars = [
    'VITE_SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'BENCHMARK_USER_JWT',
    'BENCHMARK_TEST_USER_1',
    'BENCHMARK_TEST_USER_2'
  ];

  const env: Record<string, string | undefined> = {
    supabaseUrl: process.env.VITE_SUPABASE_URL,
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    supabaseUserJwt: process.env.BENCHMARK_USER_JWT,
    testUserId1: process.env.BENCHMARK_TEST_USER_1,
    testUserId2: process.env.BENCHMARK_TEST_USER_2
  };

  const missing = requiredVars.filter(key => !env[key.replace('VITE_', '').replace('BENCHMARK_', '').toLowerCase()]);
  
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}. ` +
      `Please create .env.benchmark file with all required variables. ` +
      `See .env.benchmark.example for template.`
    );
  }

  return {
    supabaseUrl: env.supabaseUrl!,
    supabaseServiceRoleKey: env.supabaseServiceRoleKey!,
    supabaseUserJwt: env.supabaseUserJwt!,
    testUserId1: env.testUserId1!,
    testUserId2: env.testUserId2!
  };
}

/**
 * Get Supabase client authenticated as service role
 * Use ONLY for admin operations and stats queries
 */
export function getServiceClient(): SupabaseClient {
  if (!cachedServiceClient) {
    const env = loadEnv();
    cachedServiceClient = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
  }
  return cachedServiceClient;
}

/**
 * Get Supabase client authenticated as benchmark user
 * Use for RLS testing and user-level operations
 */
export function getUserClient(): SupabaseClient {
  if (!cachedClient) {
    const env = loadEnv();
    cachedClient = createClient(env.supabaseUrl, env.supabaseUserJwt, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      },
      global: {
        headers: {
          Authorization: `Bearer ${env.supabaseUserJwt}`
        }
      }
    });
  }
  return cachedClient;
}

/**
 * Get Supabase client with a specific user's JWT for cross-user RLS testing
 */
export function getTestUserClient(userJwt: string): SupabaseClient {
  return createClient(loadEnv().supabaseUrl, userJwt, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    },
    global: {
      headers: {
        Authorization: `Bearer ${userJwt}`
      }
    }
  });
}

/**
 * Clear cached clients (useful for testing)
 */
export function clearClients(): void {
  cachedClient = null;
  cachedServiceClient = null;
}

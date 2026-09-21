'use strict';

// Supabase public client. Passwords are handled only by Supabase Auth.
const CLOUD_CONFIG = {
  url: 'https://eilwhszpekradlhirwqw.supabase.co',
  key: 'sb_publishable_3eA4HVpDDtKYw6FFfRxSHw_0Hgp1uat',
};
const CloudAuth = {
  usernameDomain: '@players.neon-strike.local',
  client: null, user: null, registerMode: false, syncing: false,
  init() {
    if (!window.supabase?.createClient) return;
    this.client = window.supabase.createClient(CLOUD_CONFIG.url, CLOUD_CONFIG.key);
    this.client.auth.getSession().then(({ data }) => this.applySession(data.session));
    this.client.auth.onAuthStateChange((_event, session) => this.applySession(session));
    $('btnCloudAuth')?.addEventListener('click', () => this.open());
    $('btnCloudClose')?.addEventListener('click', () => $('cloudAuthPanel')?.close());
    $('btnCloudToggle')?.addEventListener('click', () => this.toggleMode());
    $('btnCloudSubmit')?.addEventListener('click', () => this.submit());
    this.wrapStorageSave();
  },
  wrapStorageSave() {
    if (!window.Storage || Storage._cloudWrapped) return;
    const original = Storage.save.bind(Storage);
    Storage.save = (data) => { original(data); this.queueSync(data); };
    Storage._cloudWrapped = true;
  },
  async applySession(session) {
    this.user = session?.user || null;
    const status = $('cloudStatus'), button = $('btnCloudAuth');
    if (!this.user) { if (status) status.textContent = '本地存档'; if (button) button.textContent = '账号登录'; return; }
    if (status) status.textContent = '云端已连接';
    if (button) button.textContent = '退出账号';
    button?.addEventListener('click', () => this.signOut(), { once: true });
    await this.pull();
  },
  open() {
    if (this.user) return this.signOut();
    this.registerMode = false; this.renderDialog(); $('cloudAuthPanel')?.showModal();
  },
  toggleMode() { this.registerMode = !this.registerMode; this.renderDialog(); },
  renderDialog() {
    $('cloudAuthTitle').textContent = this.registerMode ? '创建云端账号' : '账号登录';
    $('btnCloudSubmit').textContent = this.registerMode ? '注册' : '登录';
    $('btnCloudToggle').textContent = this.registerMode ? '返回登录' : '注册新账号';
    $('cloudAuthError').textContent = '';
  },
  async submit() {
    const username = $('cloudEmail').value.trim().toLowerCase(), password = $('cloudPassword').value;
    if (!/^[a-z0-9_]{3,20}$/.test(username)) { $('cloudAuthError').textContent = '用户名需为 3–20 位小写字母、数字或下划线。'; return; }
    if (password.length < 6) { $('cloudAuthError').textContent = '密码至少需要 6 位。'; return; }
    const email = username + this.usernameDomain;
    $('btnCloudSubmit').disabled = true;
    const result = this.registerMode ? await this.client.auth.signUp({ email, password }) : await this.client.auth.signInWithPassword({ email, password });
    $('btnCloudSubmit').disabled = false;
    if (result.error) {
      $('cloudAuthError').textContent = result.error.message.includes('already registered') ? '用户名已被占用，请换一个。' : result.error.message;
      return;
    }
    $('cloudAuthPanel')?.close();
    if (this.registerMode && !result.data.session) showToast('注册成功，请检查邮箱完成验证。', true);
  },
  async signOut() { await this.client?.auth.signOut(); this.user = null; this.applySession(null); },
  async pull() {
    if (!this.user || !this.client) return;
    const { data, error } = await this.client.from('player_profiles').select('*').eq('id', this.user.id).maybeSingle();
    if (error || !data) { await this.push(Storage.load()); return; }
    const local = Storage.load();
    Storage.save({ ...local, credits: data.credits, unlockedShips: data.unlocked_ships || local.unlockedShips, totalKills: data.total_kills, endlessMaxStage: data.endless_max_stage, achievements: data.achievements || local.achievements, dailyProgress: data.daily_progress || local.dailyProgress, weeklyProgress: data.weekly_progress || local.weeklyProgress, endlessCheckpoint: data.last_checkpoint || local.endlessCheckpoint });
    updateHangar?.();
  },
  queueSync(data) { if (this.user && !this.syncing) clearTimeout(this.timer), this.timer = setTimeout(() => this.push(data), 700); },
  async push(data) {
    if (!this.user || !this.client) return;
    this.syncing = true;
    await this.client.from('player_profiles').upsert({ id: this.user.id, credits: data.credits || 0, unlocked_ships: data.unlockedShips || [], total_kills: data.totalKills || 0, endless_max_stage: data.endlessMaxStage || 0, achievements: data.achievements || [], daily_progress: data.dailyProgress || {}, weekly_progress: data.weeklyProgress || {}, last_checkpoint: data.endlessCheckpoint || null, updated_at: new Date().toISOString() });
    this.syncing = false;
  },
};
window.addEventListener('DOMContentLoaded', () => CloudAuth.init());

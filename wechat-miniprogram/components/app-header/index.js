Component({
  properties: {
    navTop: { type: Number, value: 0 },
    navHeight: { type: Number, value: 44 },
    heroHeight: { type: Number, value: 64 },
    capsuleSpace: { type: Number, value: 96 },
    menuTop: { type: Number, value: 72 },
    showTopMenu: { type: Boolean, value: false },
    title: { type: String, value: '加班记录助手' },
    subtitle: { type: String, value: '专业工时管理' }
  },

  methods: {
    onToggleMenu() {
      this.triggerEvent('togglemenu');
    },

    onCloseMenu() {
      this.triggerEvent('closemenu');
    },

    onOpenSettings() {
      this.triggerEvent('opensettings');
    },

    onGoPrivacy() {
      this.triggerEvent('goprivacy');
    },

    onGoAbout() {
      this.triggerEvent('goabout');
    },

    onGoFeedback() {
      this.triggerEvent('gofeedback');
    },

    onImportJSON() {
      this.triggerEvent('importjson');
    },

    onBackupJSON() {
      this.triggerEvent('backupjson');
    },

    onExportTable() {
      this.triggerEvent('exporttable');
    },

    onClearAllRecords() {
      this.triggerEvent('clearallrecords');
    },

    noop() {}
  }
});
import React from 'react';
import { FaDownload, FaUpload, FaFileArchive, FaCog } from 'react-icons/fa';
import { Button } from 'src/components/atoms/button';
import { formatRelativeTime } from '../../utils/formatRelativeTime';
import { SettingsCard } from 'src/components/molecules/settings-card';

interface DataBackupSettingsProps {
  lastBackupAt: number;
  onExportFullBackup: () => void;
  onImportBackupClick: () => void;
  backupFileInputRef: React.RefObject<HTMLInputElement | null>;
  onBackupFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onExportSettings: () => void;
  onImportSettingsClick: () => void;
  settingsFileInputRef: React.RefObject<HTMLInputElement | null>;
  onSettingsFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

const DataBackupSettings: React.FC<DataBackupSettingsProps> = ({
  lastBackupAt, onExportFullBackup, onImportBackupClick, backupFileInputRef, onBackupFileChange,
  onExportSettings, onImportSettingsClick, settingsFileInputRef, onSettingsFileChange,
}) => {
  return (
    <div className="flex flex-col gap-5">
      <SettingsCard>
        <div className="p-5 flex gap-5 items-start">
          <div className="w-11 h-11 rounded-[10px] bg-primary/[0.14] text-primary grid place-items-center flex-none">
            <FaFileArchive size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-[15px] text-foreground">Full backup</div>
            <p className="text-[13px] text-muted-foreground mt-1 leading-relaxed">
              All chats, characters, settings and locally saved images in one zip. Everything lives only in this
              browser, so keep a copy. Restoring always adds to your library, never overwrites it.
            </p>
            <div className="flex items-center gap-2 mt-3 text-xs text-subtle">
              <span className="w-2 h-2 rounded-full bg-primary" />
              Last backup {lastBackupAt ? formatRelativeTime(lastBackupAt) : "never"}
            </div>
          </div>
        </div>
        <div className="p-4 flex gap-2.5">
          <Button onClick={onExportFullBackup}>
            <FaFileArchive /> Export full backup
          </Button>
          <Button onClick={onImportBackupClick} variant="outline">
            <FaUpload /> Restore backup
          </Button>
          <input
            type="file"
            ref={backupFileInputRef}
            onChange={onBackupFileChange}
            accept=".zip,.json"
            style={{ display: "none" }}
          />
        </div>
      </SettingsCard>

      <SettingsCard>
        <div className="p-5 flex gap-5 items-start">
          <div className="w-11 h-11 rounded-[10px] bg-secondary text-muted-foreground grid place-items-center flex-none">
            <FaCog size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-[15px] text-foreground">Settings only</div>
            <p className="text-[13px] text-muted-foreground mt-1 leading-relaxed">
              Just your model and generation preferences. No chats or characters.
            </p>
          </div>
        </div>
        <div className="p-4 flex gap-2.5">
          <Button onClick={onExportSettings} variant="outline">
            <FaDownload /> Export settings
          </Button>
          <Button onClick={onImportSettingsClick} variant="outline">
            <FaUpload /> Import settings
          </Button>
          <input
            type="file"
            ref={settingsFileInputRef}
            onChange={onSettingsFileChange}
            accept=".json"
            style={{ display: "none" }}
          />
        </div>
      </SettingsCard>
    </div>
  );
};

export default DataBackupSettings;

import { ConstantsService } from './constants.service';

import { CipherService } from '../abstractions/cipher.service';
import { CollectionService } from '../abstractions/collection.service';
import { CryptoService } from '../abstractions/crypto.service';
import { FolderService } from '../abstractions/folder.service';
import { LockService as LockServiceInterface } from '../abstractions/lock.service';
import { PlatformUtilsService } from '../abstractions/platformUtils.service';
import { StorageService } from '../abstractions/storage.service';

export class LockService implements LockServiceInterface {
    constructor(private cipherService: CipherService, private folderService: FolderService,
        private collectionService: CollectionService, private cryptoService: CryptoService,
        private platformUtilsService: PlatformUtilsService,
        private storageService: StorageService,
        private setIcon: Function, private refreshBadgeAndMenu: Function) {
        this.checkLock();
        setInterval(() => this.checkLock(), 10 * 1000); // check every 10 seconds
    }

    async checkLock(): Promise<void> {
        if (this.platformUtilsService.isViewOpen()) {
            // Do not lock
            return;
        }

        const key = await this.cryptoService.getKey();
        if (key == null) {
            // no key so no need to lock
            return;
        }

        const lockOption = await this.storageService.get<number>(ConstantsService.lockOptionKey);
        if (lockOption == null || lockOption < 0) {
            return;
        }

        const lastActive = await this.storageService.get<number>(ConstantsService.lastActiveKey);
        if (lastActive == null) {
            return;
        }

        const lockOptionSeconds = lockOption * 60;
        const diffSeconds = ((new Date()).getTime() - lastActive) / 1000;
        if (diffSeconds >= lockOptionSeconds) {
            // need to lock now
            await this.lock();
        }
    }

    async lock(): Promise<void> {
        await Promise.all([
            this.cryptoService.clearKey(),
            this.cryptoService.clearOrgKeys(true),
            this.cryptoService.clearPrivateKey(true),
            this.cryptoService.clearEncKey(true),
            this.setIcon(),
            this.refreshBadgeAndMenu(),
        ]);

        this.folderService.clearCache();
        this.cipherService.clearCache();
        this.collectionService.clearCache();
    }
}

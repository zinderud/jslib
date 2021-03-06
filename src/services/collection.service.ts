import { CollectionData } from '../models/data/collectionData';

import { Collection } from '../models/domain/collection';

import { CollectionView } from '../models/view/collectionView';

import { CollectionService as CollectionServiceAbstraction } from '../abstractions/collection.service';
import { CryptoService } from '../abstractions/crypto.service';
import { I18nService } from '../abstractions/i18n.service';
import { StorageService } from '../abstractions/storage.service';
import { UserService } from '../abstractions/user.service';

const Keys = {
    collectionsPrefix: 'collections_',
};

export class CollectionService implements CollectionServiceAbstraction {
    decryptedCollectionCache: CollectionView[];

    constructor(private cryptoService: CryptoService, private userService: UserService,
        private storageService: StorageService, private i18nService: I18nService) {
    }

    clearCache(): void {
        this.decryptedCollectionCache = null;
    }

    async get(id: string): Promise<Collection> {
        const userId = await this.userService.getUserId();
        const collections = await this.storageService.get<{ [id: string]: CollectionData; }>(
            Keys.collectionsPrefix + userId);
        if (collections == null || !collections.hasOwnProperty(id)) {
            return null;
        }

        return new Collection(collections[id]);
    }

    async getAll(): Promise<Collection[]> {
        const userId = await this.userService.getUserId();
        const collections = await this.storageService.get<{ [id: string]: CollectionData; }>(
            Keys.collectionsPrefix + userId);
        const response: Collection[] = [];
        for (const id in collections) {
            if (collections.hasOwnProperty(id)) {
                response.push(new Collection(collections[id]));
            }
        }
        return response;
    }

    async getAllDecrypted(): Promise<CollectionView[]> {
        if (this.decryptedCollectionCache != null) {
            return this.decryptedCollectionCache;
        }

        const key = await this.cryptoService.getKey();
        if (key == null) {
            throw new Error('No key.');
        }

        const decCollections: CollectionView[] = [];
        const promises: Array<Promise<any>> = [];
        const collections = await this.getAll();
        collections.forEach((collection) => {
            promises.push(collection.decrypt().then((c) => decCollections.push(c)));
        });

        await Promise.all(promises);
        decCollections.sort(this.getLocaleSortingFunction());
        this.decryptedCollectionCache = decCollections;
        return this.decryptedCollectionCache;
    }

    async upsert(collection: CollectionData | CollectionData[]): Promise<any> {
        const userId = await this.userService.getUserId();
        let collections = await this.storageService.get<{ [id: string]: CollectionData; }>(
            Keys.collectionsPrefix + userId);
        if (collections == null) {
            collections = {};
        }

        if (collection instanceof CollectionData) {
            const c = collection as CollectionData;
            collections[c.id] = c;
        } else {
            (collection as CollectionData[]).forEach((c) => {
                collections[c.id] = c;
            });
        }

        await this.storageService.save(Keys.collectionsPrefix + userId, collections);
        this.decryptedCollectionCache = null;
    }

    async replace(collections: { [id: string]: CollectionData; }): Promise<any> {
        const userId = await this.userService.getUserId();
        await this.storageService.save(Keys.collectionsPrefix + userId, collections);
        this.decryptedCollectionCache = null;
    }

    async clear(userId: string): Promise<any> {
        await this.storageService.remove(Keys.collectionsPrefix + userId);
        this.decryptedCollectionCache = null;
    }

    async delete(id: string | string[]): Promise<any> {
        const userId = await this.userService.getUserId();
        const collections = await this.storageService.get<{ [id: string]: CollectionData; }>(
            Keys.collectionsPrefix + userId);
        if (collections == null) {
            return;
        }

        if (typeof id === 'string') {
            const i = id as string;
            delete collections[id];
        } else {
            (id as string[]).forEach((i) => {
                delete collections[i];
            });
        }

        await this.storageService.save(Keys.collectionsPrefix + userId, collections);
        this.decryptedCollectionCache = null;
    }

    private getLocaleSortingFunction(): (a: CollectionView, b: CollectionView) => number {
        return (a, b) => {
            return this.i18nService.collator ? this.i18nService.collator.compare(a.name, b.name) :
                a.name.localeCompare(b.name);
        };
    }
}

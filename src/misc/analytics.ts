import { AppIdService } from '../abstractions/appId.service';
import { PlatformUtilsService } from '../abstractions/platformUtils.service';
import { StorageService } from '../abstractions/storage.service';

import { ConstantsService } from '../services/constants.service';

const GaObj = 'ga';

export class Analytics {
    private gaTrackingId: string = null;
    private isFirefox = false;
    private appVersion: string;

    constructor(win: Window, private gaFilter?: () => boolean,
        private platformUtilsService?: PlatformUtilsService, private storageService?: StorageService,
        private appIdService?: AppIdService, private dependencyResolver?: () => any) {
        if (dependencyResolver != null) {
            const deps = dependencyResolver();
            if (platformUtilsService == null && deps.platformUtilsService) {
                this.platformUtilsService = deps.platformUtilsService as PlatformUtilsService;
            }
            if (storageService == null && deps.storageService) {
                this.storageService = deps.storageService as StorageService;
            }
            if (appIdService == null && deps.appIdService) {
                this.appIdService = deps.appIdService as AppIdService;
            }
        }

        this.appVersion = this.platformUtilsService.getApplicationVersion();
        this.isFirefox = this.platformUtilsService.isFirefox();
        this.gaTrackingId = this.platformUtilsService.analyticsId();

        (win as any).GoogleAnalyticsObject = GaObj;
        (win as any)[GaObj] = async (action: string, param1: any, param2?: any) => {
            await this.ga(action, param1, param2);
        };
    }

    async ga(action: string, param1: any, param2?: any) {
        if (this.gaFilter != null && this.gaFilter()) {
            return;
        }

        const disabled = await this.storageService.get<boolean>(ConstantsService.disableGaKey);
        // Default for Firefox is disabled.
        if ((this.isFirefox && disabled == null) || disabled != null && disabled) {
            return;
        }

        if (action !== 'send' || !param1) {
            return;
        }

        const gaAnonAppId = await this.appIdService.getAnonymousAppId();
        const version = encodeURIComponent(this.appVersion);
        let message = 'v=1&tid=' + this.gaTrackingId + '&cid=' + gaAnonAppId + '&cd1=' + version;

        if (param1 === 'pageview' && param2) {
            message += this.gaTrackPageView(param2);
        } else if (typeof param1 === 'object' && param1.hitType === 'pageview') {
            message += this.gaTrackPageView(param1.page);
        } else if (param1 === 'event' && param2) {
            message += this.gaTrackEvent(param2);
        } else if (typeof param1 === 'object' && param1.hitType === 'event') {
            message += this.gaTrackEvent(param1);
        }

        const request = new XMLHttpRequest();
        request.open('POST', 'https://www.google-analytics.com/collect', true);
        request.send(message);
    }

    private gaTrackEvent(options: any) {
        return '&t=event&ec=' + (options.eventCategory ? encodeURIComponent(options.eventCategory) : 'Event') +
            '&ea=' + encodeURIComponent(options.eventAction) +
            (options.eventLabel ? '&el=' + encodeURIComponent(options.eventLabel) : '') +
            (options.eventValue ? '&ev=' + encodeURIComponent(options.eventValue) : '') +
            (options.page ? '&dp=' + this.cleanPagePath(options.page) : '');
    }

    private gaTrackPageView(pagePath: string) {
        return '&t=pageview&dp=' + this.cleanPagePath(pagePath);
    }

    private cleanPagePath(pagePath: string) {
        const paramIndex = pagePath.indexOf('?');
        if (paramIndex > -1) {
            pagePath = pagePath.substring(0, paramIndex);
        }
        if (pagePath.indexOf('!/') === 0 || pagePath.indexOf('#/') === 0) {
            pagePath = pagePath.substring(1);
        }
        return encodeURIComponent(pagePath);
    }
}

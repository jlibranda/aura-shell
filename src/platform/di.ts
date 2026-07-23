import { ApplicationError } from "@/platform/errors";

export interface ServiceToken<T> { readonly key: symbol; readonly description: string; readonly __type?: T; }
export function createServiceToken<T>(description: string): ServiceToken<T> { return { key: Symbol(description), description }; }
type Factory<T> = (container: ServiceContainer) => T;
type Registration<T> = { factory: Factory<T>; singleton: boolean; instance?: T };

export class ServiceContainer {
  private readonly registrations = new Map<symbol, Registration<unknown>>();
  constructor(private readonly parent?: ServiceContainer) {}
  registerSingleton<T>(token: ServiceToken<T>, instance: T): void { this.register(token, () => instance, true); }
  registerFactory<T>(token: ServiceToken<T>, factory: Factory<T>): void { this.register(token, factory, false); }
  registerScoped<T>(token: ServiceToken<T>, factory: Factory<T>): void { this.register(token, factory, true); }
  resolve<T>(token: ServiceToken<T>): T { const registration = this.registrations.get(token.key) as Registration<T> | undefined; if (registration) { if (registration.singleton) registration.instance ??= registration.factory(this); return registration.singleton ? registration.instance! : registration.factory(this); } if (this.parent) return this.parent.resolve(token); throw new ApplicationError("MISSING_SERVICE", `No service is registered for ${token.description}.`); }
  createScope(): ServiceContainer { return new ServiceContainer(this); }
  override<T>(token: ServiceToken<T>, instance: T): void { this.registrations.set(token.key, { factory: () => instance, singleton: true, instance }); }
  private register<T>(token: ServiceToken<T>, factory: Factory<T>, singleton: boolean): void { if (this.registrations.has(token.key)) throw new ApplicationError("DUPLICATE_SERVICE", `A service is already registered for ${token.description}.`); this.registrations.set(token.key, { factory, singleton }); }
}

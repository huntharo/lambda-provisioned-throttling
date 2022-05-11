import * as apigwy from '@aws-cdk/aws-apigatewayv2-alpha';

/**
 * Class missing from `@aws-cdk/aws-apigatewayv2-alpha`.
 */
export class HttpRouteIntegration extends apigwy.HttpRouteIntegration {
  private httpIntegrationProps?: apigwy.HttpIntegrationProps;

  constructor(
    id: string,
    opts: { integration?: apigwy.HttpIntegration; integrationProps?: apigwy.HttpIntegrationProps },
  ) {
    super(id);
    this.httpIntegrationProps = opts.integrationProps;
    // @ts-expect-error no we need to access this...
    this.integration = opts.integration;
  }

  /**
   * (experimental) Bind this integration to the route.
   *
   * @experimental
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public bind(_options: apigwy.HttpRouteIntegrationBindOptions): apigwy.HttpRouteIntegrationConfig {
    if (this.httpIntegrationProps === undefined) {
      throw new TypeError('bind called without IntegrationProps defined');
    }

    return {
      type: this.httpIntegrationProps.integrationType,
      payloadFormatVersion:
        this.httpIntegrationProps.payloadFormatVersion ?? apigwy.PayloadFormatVersion.VERSION_2_0,
      connectionType: this.httpIntegrationProps.connectionType,
      connectionId: this.httpIntegrationProps.connectionId,
      credentials: this.httpIntegrationProps.credentials,
      method: this.httpIntegrationProps.method,
      parameterMapping: this.httpIntegrationProps.parameterMapping,
      secureServerName: this.httpIntegrationProps.secureServerName,
      subtype: this.httpIntegrationProps.integrationSubtype,
      uri: this.httpIntegrationProps.integrationUri,
    };
  }
}

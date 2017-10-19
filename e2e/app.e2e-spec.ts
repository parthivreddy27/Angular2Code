import { Angular2jsonPage } from './app.po';

describe('angular2json App', () => {
  let page: Angular2jsonPage;

  beforeEach(() => {
    page = new Angular2jsonPage();
  });

  it('should display welcome message', () => {
    page.navigateTo();
    expect(page.getParagraphText()).toEqual('Welcome to app!');
  });
});
